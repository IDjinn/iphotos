using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Processes variant_jobs on two lane pools backed by the same queue (PostgreSQL,
/// FOR UPDATE SKIP LOCKED): fast lanes pull photo-only jobs (EXIF + previews are
/// cheap), slow lanes pull video-only jobs (ffmpeg is expensive). Capacities and
/// per-job wall-clock budgets come from <see cref="WorkerOptions"/>. Woken instantly
/// by LISTEN/NOTIFY (<see cref="PostgresQueueListener"/>); the idle wait only bounds
/// missed notifications.
/// </summary>
public sealed class VariantProcessingWorker : BackgroundService
{
    public VariantProcessingWorker(
        IServiceScopeFactory scopeFactory,
        PostgresQueueListener queueListener,
        IOptions<WorkerOptions> options,
        ILogger<VariantProcessingWorker> logger)
    {
        this.scopeFactory = scopeFactory;
        this.queueListener = queueListener;
        this.options = options;
        this.logger = logger;
        _photoLanes = Math.Max(1, options.Value.PhotoLaneConcurrency);
        _videoLanes = Math.Max(1, options.Value.VideoLaneConcurrency);
        _photoTimeout = TimeSpan.FromMinutes(Math.Max(1, options.Value.PhotoJobTimeoutMinutes));
        _videoTimeout = TimeSpan.FromMinutes(Math.Max(1, options.Value.VideoJobTimeoutMinutes));
        _laneGroups = [new Task[_photoLanes], new Task[_videoLanes]];
    }

    private readonly int _photoLanes;
    private readonly int _videoLanes;
    private readonly TimeSpan _photoTimeout;
    private readonly TimeSpan _videoTimeout;

    private readonly IServiceScopeFactory scopeFactory;
    private readonly PostgresQueueListener queueListener;
    private readonly IOptions<WorkerOptions> options;
    private readonly ILogger<VariantProcessingWorker> logger;

    /// <summary>One slot per lane; a slot holds the in-flight job task until the next
    /// refill pass replaces completed ones.</summary>
    private readonly List<Task[]> _laneGroups;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retryInterval = TimeSpan.FromSeconds(Math.Max(0.25, options.Value.PollIntervalSeconds));
        var idleInterval = TimeSpan.FromSeconds(Math.Max(5, options.Value.IdlePollSeconds));
        logger.LogInformation(
            "Variant processing worker started (photo lanes {Photos} @ {PhotoTimeout}m, video lanes {Videos} @ {VideoTimeout}m, idle wait {Idle}s)",
            _photoLanes, _photoTimeout.TotalMinutes, _videoLanes, _videoTimeout.TotalMinutes, idleInterval.TotalSeconds);

        using var wake = queueListener.Subscribe();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Fill every free lane; lanes stop pulling when their queue slice is empty.
                await using var scope = scopeFactory.CreateAsyncScope();
                var jobs = scope.ServiceProvider.GetRequiredService<IVariantJobRepository>();

                foreach (var (group, kind) in PairWithKinds())
                {
                    for (var lane = 0; lane < group.Length; lane++)
                    {
                        if (group[lane] is { IsCompleted: false })
                        {
                            continue;
                        }

                        var job = await jobs.DequeueNextAsync(kind, stoppingToken);
                        if (job is null)
                        {
                            break;
                        }

                        group[lane] = Task.Run(
                            () => RunJobAsync(job, kind, stoppingToken), CancellationToken.None);
                        logger.LogInformation(
                            "Processing variant job {JobId} for photo {PhotoId} (lane {Kind}, attempt {Attempt}/{Max})",
                            job.Id, job.PhotoId, kind, job.Attempts + 1, job.MaxAttempts);
                    }
                }

                if (_laneGroups.All(g => g.All(t => t is null || t.IsCompleted)))
                {
                    // Nothing claimed on either slice — sleep until a notification or the
                    // idle fallback, then try again (a job may have raced a lane check).
                    await wake.WaitAsync(idleInterval, stoppingToken);
                    continue;
                }

                // Wait for at least one lane to free up; completed lanes are observed by
                // the refill pass above (exceptions are logged inside RunJobAsync).
                await Task.WhenAny(
                    _laneGroups.SelectMany(g => g)
                        .Where(t => t is { IsCompleted: false })
                        .Select(t => t));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Variant processing loop failed; retrying after poll interval");
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

        logger.LogInformation("Variant processing worker stopped");
    }

    private (Task[] Group, MediaType Kind)[] PairWithKinds() =>
        [(_laneGroups[0], MediaType.Photo), (_laneGroups[1], MediaType.Video)];

    /// <summary>
    /// Runs one claimed job under a hard wall-clock budget: a hung job (dead storage
    /// connection, stuck ffmpeg) fails instead of holding its lane forever.
    /// </summary>
    private async Task RunJobAsync(VariantJob job, MediaType kind, CancellationToken stoppingToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var handler = scope.ServiceProvider.GetRequiredService<VariantProcessingHandler>();
            var jobs = scope.ServiceProvider.GetRequiredService<IVariantJobRepository>();
            var photos = scope.ServiceProvider.GetRequiredService<IPhotoRepository>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var timeout = kind == MediaType.Video ? _videoTimeout : _photoTimeout;
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            budget.CancelAfter(timeout);

            try
            {
                await handler.ProcessJobAsync(job, budget.Token);
                logger.LogInformation("Variant job {JobId} finished in state {State}", job.Id, job.State);
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested && budget.IsCancellationRequested)
            {
                // Timed out: release the claim so the normal retry bookkeeping applies.
                var message = $"Job exceeded its {timeout.TotalMinutes:0} minute budget.";
                if (job.Fail(message, DateTimeOffset.UtcNow))
                {
                    await jobs.SaveAsync(job, stoppingToken);
                    logger.LogWarning("Variant job {JobId} timed out; requeued (attempt {Attempt}/{Max})",
                        job.Id, job.Attempts, job.MaxAttempts);
                }
                else
                {
                    await jobs.SaveAsync(job, stoppingToken);
                    logger.LogError("Variant job {JobId} timed out permanently", job.Id);
                }

                var photo = await photos.GetByIdAsync(job.PhotoId, stoppingToken);
                photo?.MarkFailed(message, DateTimeOffset.UtcNow);
                await unitOfWork.SaveChangesAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutdown: the row stays in Processing and the next start requeues it,
            // same recovery path as a worker crash.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Variant job {JobId} lane crashed", job.Id);
        }
    }
}
