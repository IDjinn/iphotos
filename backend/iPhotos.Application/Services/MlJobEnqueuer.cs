using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Single enqueue point for the AI pipelines (doc 18 §6.1): photos that became
/// Ready get one faces job, plus a labels job when a vision endpoint is configured.
/// Best-effort by design — a failure here only delays AI indexing, and the worker's
/// backfill sweep re-enqueues any Ready photo still missing rows.
/// </summary>
public sealed class MlJobEnqueuer(
    IMlJobRepository jobs,
    IOptions<AiOptions> aiOptions,
    IOptions<VisionOptions> visionOptions,
    ILogger<MlJobEnqueuer> logger)
{
    public async Task EnqueueForReadyPhotoAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        if (!aiOptions.Value.Enabled || photo.MediaType != MediaType.Photo)
        {
            return;
        }

        try
        {
            await jobs.EnqueueAsync(photo.OwnerId, photo.Id, MlJobKind.Faces, cancellationToken);
            if (visionOptions.Value.IsConfigured)
            {
                await jobs.EnqueueAsync(photo.OwnerId, photo.Id, MlJobKind.Labels, cancellationToken);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Never fail the upload pipeline over AI bookkeeping; the backfill sweep
            // enqueues this photo again on its next pass.
            logger.LogWarning(ex, "Failed to enqueue ML jobs for photo {PhotoId}; backfill will retry", photo.Id);
        }
    }
}
