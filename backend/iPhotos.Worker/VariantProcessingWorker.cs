using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Polls the variant_jobs queue (PostgreSQL, FOR UPDATE SKIP LOCKED) and processes one
/// job at a time: EXIF indexing + preview/thumbnail generation.
/// </summary>
public sealed class VariantProcessingWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<WorkerOptions> options,
    ILogger<VariantProcessingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var pollInterval = TimeSpan.FromSeconds(Math.Max(1, options.Value.PollIntervalSeconds));
        logger.LogInformation("Variant processing worker started (poll every {Seconds}s)", pollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var jobs = scope.ServiceProvider.GetRequiredService<IVariantJobRepository>();
                var handler = scope.ServiceProvider.GetRequiredService<VariantProcessingHandler>();

                var job = await jobs.DequeueNextAsync(stoppingToken);
                if (job is null)
                {
                    await Task.Delay(pollInterval, stoppingToken);
                    continue;
                }

                logger.LogInformation(
                    "Processing variant job {JobId} for photo {PhotoId} (attempt {Attempt}/{Max})",
                    job.Id, job.PhotoId, job.Attempts + 1, job.MaxAttempts);
                await handler.ProcessJobAsync(job, stoppingToken);
                logger.LogInformation("Variant job {JobId} finished in state {State}", job.Id, job.State);
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
                    await Task.Delay(pollInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        logger.LogInformation("Variant processing worker stopped");
    }
}
