using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Processes zip_import_jobs one at a time (PostgreSQL, FOR UPDATE SKIP LOCKED):
/// archive extraction + photo ingestion (docs/plans/09 §Imports). Woken instantly by
/// LISTEN/NOTIFY (<see cref="PostgresQueueListener"/>); the idle wait only bounds
/// missed notifications.
/// </summary>
public sealed class ZipImportWorker(
    IServiceScopeFactory scopeFactory,
    PostgresQueueListener queueListener,
    IOptions<WorkerOptions> options,
    ILogger<ZipImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retryInterval = TimeSpan.FromSeconds(Math.Max(1, options.Value.PollIntervalSeconds));
        var idleInterval = TimeSpan.FromSeconds(Math.Max(5, options.Value.IdlePollSeconds));
        logger.LogInformation("Zip import worker started (idle wait {Idle}s, retry {Retry}s)",
            idleInterval.TotalSeconds, retryInterval.TotalSeconds);

        // A worker crash mid-import strands jobs in Processing; dedup makes re-running
        // them safe, so requeue before starting the normal poll loop. Uploads stranded
        // in Uploading are different: their HTTP connection died with the old API
        // process, so the bytes are gone — fail them visibly instead of stalling forever.
        try
        {
            using var startupScope = scopeFactory.CreateScope();
            var imports = startupScope.ServiceProvider.GetRequiredService<IZipImportRepository>();
            var requeued = await imports.RequeueStuckAsync(stoppingToken);
            if (requeued > 0)
            {
                logger.LogWarning("Requeued {Count} zip import job(s) stranded in Processing by a previous run", requeued);
            }

            var failedUploads = await imports.FailStaleUploadsAsync(TimeSpan.FromMinutes(30), stoppingToken);
            if (failedUploads > 0)
            {
                logger.LogWarning("Failed {Count} zip import job(s) stranded in Uploading (upload connection lost)", failedUploads);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Zip import startup recovery failed");
        }

        using var wake = queueListener.Subscribe();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var jobs = scope.ServiceProvider.GetRequiredService<IZipImportRepository>();
                var handler = scope.ServiceProvider.GetRequiredService<ZipImportHandler>();

                var job = await jobs.DequeueNextAsync(stoppingToken);
                if (job is null)
                {
                    await wake.WaitAsync(idleInterval, stoppingToken);
                    continue;
                }

                logger.LogInformation(
                    "Processing zip import job {JobId} '{FileName}' for owner {OwnerId} (attempt {Attempt}/{Max})",
                    job.Id, job.FileName, job.OwnerId, job.Attempts + 1, job.MaxAttempts);
                await handler.ProcessJobAsync(job, stoppingToken);
                logger.LogInformation(
                    "Zip import job {JobId} finished in state {State} (imported {Imported}, duplicated {Duplicated}, ignored {Ignored}, videos skipped {VideosIgnored}, failed {Failed})",
                    job.Id, job.State, job.Imported, job.Duplicated, job.Ignored, job.VideosIgnored, job.Failed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Zip import loop failed; retrying after poll interval");
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

        logger.LogInformation("Zip import worker stopped");
    }
}
