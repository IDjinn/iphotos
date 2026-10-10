using iPhotos.Application;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Runs <see cref="ZipImportCleanupService"/> passes: the first immediately at startup
/// (reaping archives stranded by the previous process — multi-GB orphans would
/// otherwise sit on the staging disk forever) and then periodically. Startup passes
/// use a short upload age (any straggler's connection died with the old API process);
/// periodic passes use a much larger one so a legitimate slow upload is never failed.
/// </summary>
public sealed class ZipImportCleanupWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<ZipImportCleanupOptions> options,
    ILogger<ZipImportCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.Value.IntervalMinutes));
        var startupAge = TimeSpan.FromMinutes(Math.Max(1, options.Value.StartupStaleUploadMinutes));
        var periodicAge = TimeSpan.FromHours(Math.Max(1, options.Value.StaleUploadHours));
        logger.LogInformation(
            "Zip import cleanup worker started (every {Interval}min, startup upload age {Startup}min, periodic upload age {Periodic}h)",
            interval.TotalMinutes, startupAge.TotalMinutes, periodicAge.TotalHours);

        try
        {
            await RunPassAsync(startupAge, stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(interval, stoppingToken);
                await RunPassAsync(periodicAge, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down; whatever a pass was mid-way through resumes next boot.
        }

        logger.LogInformation("Zip import cleanup worker stopped");
    }

    private async Task RunPassAsync(TimeSpan staleUploadAge, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var cleanup = scope.ServiceProvider.GetRequiredService<ZipImportCleanupService>();
            var report = await cleanup.RunOnceAsync(staleUploadAge, cancellationToken);
            if (report.FailedUploads > 0 || report.BlobsDeleted > 0)
            {
                logger.LogWarning(
                    "Zip import cleanup pass: failed {Uploads} abandoned upload(s), deleted {Blobs} staged archive(s)",
                    report.FailedUploads, report.BlobsDeleted);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Zip import cleanup pass failed; retrying after interval");
        }
    }
}
