using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Processes variant_jobs one at a time (PostgreSQL, FOR UPDATE SKIP LOCKED): EXIF
/// indexing + preview/thumbnail generation. Woken instantly by LISTEN/NOTIFY
/// (<see cref="PostgresQueueListener"/>); the idle wait only bounds missed notifications.
/// </summary>
public sealed class VariantProcessingWorker(
    IServiceScopeFactory scopeFactory,
    PostgresQueueListener queueListener,
    IOptions<WorkerOptions> options,
    ILogger<VariantProcessingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retryInterval = TimeSpan.FromSeconds(Math.Max(0.25, options.Value.PollIntervalSeconds));
        var idleInterval = TimeSpan.FromSeconds(Math.Max(5, options.Value.IdlePollSeconds));
        logger.LogInformation("Variant processing worker started (idle wait {Idle}s, retry {Retry}s)",
            idleInterval.TotalSeconds, retryInterval.TotalSeconds);

        using var wake = queueListener.Subscribe();
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
                    await wake.WaitAsync(idleInterval, stoppingToken);
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
}
