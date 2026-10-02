using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Polls the zip_import_jobs queue (PostgreSQL, FOR UPDATE SKIP LOCKED) and processes
/// one job at a time: archive extraction + photo ingestion (docs/plans/09 §Imports).
/// </summary>
public sealed class ZipImportWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<WorkerOptions> options,
    ILogger<ZipImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var pollInterval = TimeSpan.FromSeconds(Math.Max(1, options.Value.PollIntervalSeconds));
        logger.LogInformation("Zip import worker started (poll every {Seconds}s)", pollInterval.TotalSeconds);

        // A worker crash mid-import strands jobs in Processing; dedup makes re-running
        // them safe, so requeue before starting the normal poll loop.
        try
        {
            using var startupScope = scopeFactory.CreateScope();
            var imports = startupScope.ServiceProvider.GetRequiredService<IZipImportRepository>();
            var requeued = await imports.RequeueStuckAsync(stoppingToken);
            if (requeued > 0)
            {
                logger.LogWarning("Requeued {Count} zip import job(s) stranded in Processing by a previous run", requeued);
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
                    await Task.Delay(pollInterval, stoppingToken);
                    continue;
                }

                logger.LogInformation(
                    "Processing zip import job {JobId} '{FileName}' for owner {OwnerId} (attempt {Attempt}/{Max})",
                    job.Id, job.FileName, job.OwnerId, job.Attempts + 1, job.MaxAttempts);
                await handler.ProcessJobAsync(job, stoppingToken);
                logger.LogInformation(
                    "Zip import job {JobId} finished in state {State} (imported {Imported}, duplicated {Duplicated}, ignored {Ignored}, failed {Failed})",
                    job.Id, job.State, job.Imported, job.Duplicated, job.Ignored, job.Failed);
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
                    await Task.Delay(pollInterval, stoppingToken);
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
