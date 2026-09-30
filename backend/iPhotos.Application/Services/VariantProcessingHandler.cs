using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

/// <summary>
/// Processes a claimed variant job: extracts indexing metadata (EXIF), generates the
/// preview/thumbnail variants, stores them and moves the photo to Ready. Executed by
/// the iPhotos.Worker background service.
/// </summary>
public sealed class VariantProcessingHandler(
    IPhotoRepository photos,
    IVariantRepository variants,
    IBlobStorage blobStorage,
    IImageVariantGenerator generator,
    IExifExtractor exifExtractor,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime)
{
    public async Task ProcessJobAsync(VariantJob job, CancellationToken cancellationToken = default)
    {
        if (job.State == JobState.Queued)
        {
            job.Start();
        }

        var photo = await photos.GetByIdAsync(job.PhotoId, cancellationToken);
        if (photo is null)
        {
            // Photo was deleted while the job was queued — nothing to do.
            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        photo.MarkProcessing(dateTime.UtcNow);
        try
        {
            var metadata = await ExtractMetadataAsync(photo, cancellationToken);
            await variants.DeleteByPhotoAsync(photo.Id, cancellationToken);

            foreach (var kind in new[] { VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail })
            {
                await StoreVariantAsync(photo, kind, metadata, cancellationToken);
            }

            photo.MarkReady(metadata, dateTime.UtcNow);
            job.Complete(dateTime.UtcNow);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            photo.MarkFailed(ex.Message, dateTime.UtcNow);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<PhotoMetadata> ExtractMetadataAsync(Photo photo, CancellationToken cancellationToken)
    {
        await using var original = await blobStorage.OpenReadAsync(photo.OriginalBlobPath, cancellationToken);
        return await exifExtractor.ExtractAsync(original, cancellationToken);
    }

    private async Task StoreVariantAsync(Photo photo, VariantKind kind, PhotoMetadata metadata, CancellationToken cancellationToken)
    {
        if (kind == VariantKind.Original)
        {
            await variants.AddAsync(
                PhotoVariant.Create(
                    photo.Id, kind, photo.OriginalBlobPath,
                    metadata.Width, metadata.Height, photo.SizeBytes,
                    FormatFromMime(photo.MimeType), dateTime.UtcNow),
                cancellationToken);
            return;
        }

        await using var original = await blobStorage.OpenReadAsync(photo.OriginalBlobPath, cancellationToken);
        var output = await generator.GenerateAsync(original, kind, cancellationToken);
        var blobPath = kind == VariantKind.Preview
            ? BlobPaths.Preview(photo.OwnerId, photo.Id)
            : BlobPaths.Thumbnail(photo.OwnerId, photo.Id);

        await blobStorage.PutAsync(blobPath, output.Content, cancellationToken);
        await variants.AddAsync(
            PhotoVariant.Create(
                photo.Id, kind, blobPath,
                output.Width, output.Height, output.SizeBytes,
                output.Format, dateTime.UtcNow),
            cancellationToken);
    }

    private static string FormatFromMime(string mimeType) => mimeType.ToLowerInvariant() switch
    {
        "image/jpeg" => "jpeg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "bin",
    };
}
