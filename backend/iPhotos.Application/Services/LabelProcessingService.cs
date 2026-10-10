using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Processes one labels job (doc 18 §8): classifies the photo's thumbnail through
/// the configured OpenAI-compatible vision endpoint and replaces the photo's label
/// set. Labels are raw backend data — clients only display them.
/// </summary>
public sealed class LabelProcessingService(
    IPhotoRepository photos,
    IVariantRepository variants,
    IVisionLabeler labeler,
    IPhotoLabelRepository labels,
    IBlobStorage blobStorage,
    IMlInputCache inputCache,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<VisionOptions> options,
    ILogger<LabelProcessingService> logger) : IMlJobHandler
{
    public async Task ProcessJobAsync(MlJob job, CancellationToken cancellationToken = default)
    {
        if (!options.Value.IsConfigured)
        {
            job.FailWithoutRetry("Vision endpoint is not configured (Vision:BaseUrl/Model).", dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        var photo = await photos.GetByIdAsync(job.PhotoId!.Value, cancellationToken);
        if (photo is null || photo.State != PhotoState.Ready || photo.MediaType != MediaType.Photo)
        {
            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        try
        {
            // The 320px thumbnail is enough for scene tags — cheaper for local VLMs.
            var thumbnailPath = BlobPaths.Thumbnail(photo.OwnerId, photo.Id);
            IReadOnlyList<LabelResult> results;
            await using (var thumbnail = await OpenInputAsync(photo.Id, thumbnailPath, cancellationToken))
            {
                results = await labeler.ClassifyAsync(thumbnail, cancellationToken);
            }

            var vision = options.Value;
            var model = vision.Model;
            var kept = results
                .Where(r => r.Score >= vision.MinScore)
                .Select(r => PhotoLabel.Create(photo.Id, photo.OwnerId, r.Name, r.Score, model, dateTime.UtcNow))
                .Where(l => PhotoLabel.IsValid(l.Label))
                .GroupBy(l => l.Label)
                .Select(group => group.First())
                .OrderByDescending(l => l.Score)
                .Take(vision.MaxLabels)
                .ToList();

            await labels.ReplaceForPhotoAsync(photo, kept, cancellationToken);

            logger.LogInformation(
                "Labels job {JobId}: {Kept} labels for photo {PhotoId} ({Raw} returned)",
                job.Id, kept.Count, photo.Id, results.Count);

            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            // The staged thumbnail was consumed — drop it (the stale sweep is the
            // safety net for early-complete paths that never read it).
            inputCache.Delete(photo.Id, MlInputKind.Thumbnail);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            logger.LogWarning(ex, "Labels job {JobId} failed, {Outcome} (attempt {Attempt}/{Max})",
                job.Id, willRetry ? "requeued" : "permanently failed", job.Attempts, job.MaxAttempts);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    /// <summary>Local cache first (doc 18 §6.2); the blob download is the fallback for
    /// a cold cache (worker restarts, library backfill of pre-cache photos).</summary>
    private async Task<Stream> OpenInputAsync(Guid photoId, string blobPath, CancellationToken cancellationToken)
    {
        var cached = await inputCache.TryOpenReadAsync(photoId, MlInputKind.Thumbnail, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        logger.LogDebug("ML input cache miss for photo {PhotoId} (Thumbnail); downloading {BlobPath}", photoId, blobPath);
        return await blobStorage.OpenReadAsync(blobPath, cancellationToken);
    }
}
