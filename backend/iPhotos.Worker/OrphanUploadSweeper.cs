using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Deletes photos stuck in PendingUpload: the client received an upload ticket but never
/// completed the direct upload (app killed, network lost). Sweeping releases the reserved
/// quota and removes any partial blob left behind in storage.
/// </summary>
public sealed class OrphanUploadSweeper(
    IServiceScopeFactory scopeFactory,
    IOptions<OrphanSweepOptions> options,
    ILogger<OrphanUploadSweeper> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.Value.IntervalMinutes));
        var maxAge = TimeSpan.FromHours(Math.Max(1, options.Value.MaxAgeHours));
        logger.LogInformation(
            "Orphan upload sweeper started (every {Minutes}min, max age {Hours}h)",
            interval.TotalMinutes, maxAge.TotalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, stoppingToken);
                await SweepAsync(maxAge, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Orphan upload sweep failed; retrying after interval");
            }
        }

        logger.LogInformation("Orphan upload sweeper stopped");
    }

    private async Task SweepAsync(TimeSpan maxAge, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var photos = scope.ServiceProvider.GetRequiredService<IPhotoRepository>();
        var blobs = scope.ServiceProvider.GetRequiredService<IBlobStorage>();
        var now = scope.ServiceProvider.GetRequiredService<IDateTimeProvider>().UtcNow;

        var stale = await photos.ListStalePendingUploadsAsync(now - maxAge, cancellationToken);
        foreach (var photo in stale)
        {
            // Abort open multipart sessions first so S3 discards the uploaded parts —
            // otherwise they keep billing until a lifecycle rule cleans them up.
            if (photo.MultipartUploadId is not null)
            {
                try
                {
                    await blobs.AbortMultipartUploadAsync(photo.OriginalBlobPath, photo.MultipartUploadId, cancellationToken);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Could not abort multipart session for photo {PhotoId}", photo.Id);
                }
            }

            try
            {
                await blobs.DeleteAsync(photo.OriginalBlobPath, cancellationToken);
            }
            catch (Exception ex)
            {
                // Blob already gone or storage unavailable — the row must go either way.
                logger.LogWarning(ex, "Could not delete orphan blob {Path} for photo {PhotoId}",
                    photo.OriginalBlobPath, photo.Id);
            }

            await photos.DeleteAsync(photo, cancellationToken);
            logger.LogInformation("Deleted orphan upload {PhotoId} ({FileName})", photo.Id, photo.FileName);
        }
    }
}
