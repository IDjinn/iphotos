using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Generic single-queue worker for the AI pipelines (doc 18 §6.2): claims ml_jobs
/// of one kind with FOR UPDATE SKIP LOCKED, runs a fixed lane pool under a
/// wall-clock budget per job, wakes on LISTEN/NOTIFY like the variant worker. The
/// kind decides lanes/timeout and which scoped IMlJobHandler runs the job.
/// </summary>
public sealed class MlJobWorker(
    IServiceScopeFactory scopeFactory,
    PostgresQueueListener queueListener,
    IOptions<WorkerOptions> options,
    MlJobKind kind,
    int lanes,
    TimeSpan timeout,
    ILogger<MlJobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retryInterval = TimeSpan.FromSeconds(Math.Max(0.25, options.Value.PollIntervalSeconds));
        var idleInterval = TimeSpan.FromSeconds(Math.Max(5, options.Value.IdlePollSeconds));
        lanes = Math.Max(1, lanes);
        var inFlight = new Task[lanes];

        logger.LogInformation(
            "ML worker started (kind {Kind}, lanes {Lanes}, budget {Budget}s)", kind, lanes, timeout.TotalSeconds);

        using var wake = queueListener.Subscribe();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var jobs = scope.ServiceProvider.GetRequiredService<IMlJobRepository>();

                for (var lane = 0; lane < inFlight.Length; lane++)
                {
                    if (inFlight[lane] is { IsCompleted: false })
                    {
                        continue;
                    }

                    var job = await jobs.DequeueNextAsync(kind, stoppingToken);
                    if (job is null)
                    {
                        break;
                    }

                    var captured = job;
                    inFlight[lane] = Task.Run(() => RunJobAsync(captured, stoppingToken), CancellationToken.None);
                    logger.LogInformation(
                        "Processing ML job {JobId} (kind {Kind}, photo {PhotoId}, attempt {Attempt}/{Max})",
                        captured.Id, kind, captured.PhotoId, captured.Attempts + 1, captured.MaxAttempts);
                }

                if (inFlight.All(t => t is null || t.IsCompleted))
                {
                    await wake.WaitAsync(idleInterval, stoppingToken);
                    continue;
                }

                await Task.WhenAny(inFlight.Where(t => t is { IsCompleted: false }).Select(t => t));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "ML worker loop failed (kind {Kind}); retrying after poll interval", kind);
                try
                {
                    await Task.Delay(retryInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        logger.LogInformation("ML worker stopped (kind {Kind})", kind);
    }

    /// <summary>Wall-clock budget per job: a hung inference/storage call fails the job
    /// (normal retry bookkeeping) instead of holding its lane forever. Handler
    /// exceptions leave the row in Processing — the backfill sweeper requeues it.</summary>
    private async Task RunJobAsync(MlJob job, CancellationToken stoppingToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var handler = scope.ServiceProvider.GetRequiredKeyedService<IMlJobHandler>(job.Kind);
            var jobs = scope.ServiceProvider.GetRequiredService<IMlJobRepository>();

            using var budget = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            budget.CancelAfter(timeout);

            try
            {
                await handler.ProcessJobAsync(job, budget.Token);
                // The job entity was claimed on the loop scope's context, which is
                // gone by now — it is detached here, so the handler's own
                // SaveChanges never sees its Complete/Fail transitions (they'd sit
                // in Processing forever and get requeued on every restart). Update
                // re-attaches it as modified and persists the final state.
                await jobs.SaveAsync(job, stoppingToken);
                logger.LogInformation("ML job {JobId} finished in state {State}", job.Id, job.State);
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested && budget.IsCancellationRequested)
            {
                var message = $"Job exceeded its {timeout.TotalSeconds:0}s budget.";
                var willRetry = job.Fail(message, DateTimeOffset.UtcNow);
                await jobs.SaveAsync(job, stoppingToken);
                logger.LogWarning("ML job {JobId} timed out; {Outcome} (attempt {Attempt}/{Max})",
                    job.Id, willRetry ? "requeued" : "permanently failed", job.Attempts, job.MaxAttempts);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutdown: the row stays in Processing and the backfill sweeper requeues it.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ML job {JobId} lane crashed (kind {Kind})", job.Id, kind);
        }
    }
}

/// <summary>
/// Startup recovery + backfill (doc 18 §6.1): requeues jobs stranded in Processing,
/// then periodically enqueues faces/labels jobs for Ready photos that have no rows
/// yet — the library backfill for AI enabled after the fact. Runs its batches with
/// owner-level debouncing so a busy queue is never double-enqueued.
/// </summary>
public sealed class MlBackfillSweeper(
    IServiceScopeFactory scopeFactory,
    IOptions<WorkerOptions> options,
    IOptions<AiOptions> aiOptions,
    ILogger<MlBackfillSweeper> logger) : BackgroundService
{
    /// <summary>Age at which a staged ML input is presumed orphaned (jobs older than
    /// this exhausted their retry budget long before; the blob fallback re-serves them).</summary>
    private static readonly TimeSpan InputCacheMaxAge = TimeSpan.FromHours(48);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var workerOptions = options.Value;
        var interval = TimeSpan.FromHours(Math.Max(0.25, workerOptions.MlBackfillIntervalHours));
        logger.LogInformation("ML backfill sweeper started (interval {Hours}h, batch {Batch}, library backfill {Backfill})",
            interval.TotalHours, workerOptions.MlBackfillBatchSize, aiOptions.Value.BackfillEnabled ? "on" : "off");

        // Startup recovery for rows stranded by a worker crash (Processing at boot).
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var requeued = await scope.ServiceProvider.GetRequiredService<IMlJobRepository>()
                .RequeueStuckAsync(stoppingToken);
            if (requeued > 0)
            {
                logger.LogInformation("Requeued {Count} ML jobs stranded in Processing", requeued);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ML job recovery sweep failed; will retry on next pass");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ML backfill sweep failed; will retry on next pass");
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        logger.LogInformation("ML backfill sweeper stopped");
    }

    private async Task SweepAsync(CancellationToken stoppingToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var ai = aiOptions.Value;
        var vision = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<VisionOptions>>().Value;

        // Cache hygiene runs regardless of the AI switches: leftovers of deleted
        // photos or pipelines turned off must not accumulate on the shared volume.
        await sp.GetRequiredService<IMlInputCache>().DeleteStaleAsync(InputCacheMaxAge, stoppingToken);

        if (!ai.Enabled)
        {
            return;
        }

        // Library backfill is opt-in (Ai:BackfillEnabled): every backfilled photo
        // re-downloads its preview from blob storage (S3 GETs), so new-photos-only
        // is the default posture (doc 18 §6.1).
        if (!ai.BackfillEnabled)
        {
            return;
        }

        var jobs = sp.GetRequiredService<IMlJobRepository>();
        var batchSize = Math.Max(1, options.Value.MlBackfillBatchSize);

        // Faces backfill: Ready photos without face rows. Owners with a pending
        // faces/cluster job are skipped — the next pass picks up the remainder.
        var skippedOwners = new HashSet<Guid>();
        foreach (var (photoId, ownerId) in await jobs.ListReadyPhotosWithoutFacesAsync(batchSize, stoppingToken))
        {
            if (skippedOwners.Contains(ownerId) || await jobs.HasPendingAsync(ownerId, MlJobKind.Faces, stoppingToken))
            {
                skippedOwners.Add(ownerId);
                continue;
            }

            await jobs.EnqueueAsync(ownerId, photoId, MlJobKind.Faces, stoppingToken);
        }

        // Labels backfill: same shape, gated on a configured vision endpoint.
        if (!vision.IsConfigured)
        {
            return;
        }

        skippedOwners.Clear();
        foreach (var (photoId, ownerId) in await jobs.ListReadyPhotosWithoutLabelsAsync(batchSize, stoppingToken))
        {
            if (skippedOwners.Contains(ownerId) || await jobs.HasPendingAsync(ownerId, MlJobKind.Labels, stoppingToken))
            {
                skippedOwners.Add(ownerId);
                continue;
            }

            await jobs.EnqueueAsync(ownerId, photoId, MlJobKind.Labels, stoppingToken);
        }
    }
}
