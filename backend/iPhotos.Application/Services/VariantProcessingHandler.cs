using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

/// <summary>
/// Processes a claimed variant job: extracts indexing metadata (EXIF for photos,
/// ffprobe/ffmpeg for videos), generates the preview/thumbnail variants, stores them
/// and moves the media to Ready. Executed by the iPhotos.Worker background service.
/// </summary>
public sealed class VariantProcessingHandler(
    IPhotoRepository photos,
    IVariantRepository variants,
    IBlobStorage blobStorage,
    IImageVariantGenerator generator,
    IExifExtractor exifExtractor,
    IVideoProcessor videoProcessor,
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
            // One download serves every consumer: the blob layer returns a seekable
            // stream (delete-on-close temp file), so metadata, preview and thumbnail
            // reuse it instead of re-fetching the original from storage.
            await using var original = await blobStorage.OpenReadAsync(photo.OriginalBlobPath, cancellationToken);
            await variants.DeleteByPhotoAsync(photo.Id, cancellationToken);

            if (photo.MediaType == MediaType.Video)
            {
                await ProcessVideoAsync(photo, original, cancellationToken);
            }
            else
            {
                var metadata = await exifExtractor.ExtractAsync(original, cancellationToken);

                foreach (var kind in new[] { VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail })
                {
                    original.Position = 0;
                    await StoreVariantAsync(photo, kind, metadata, original, cancellationToken);
                }

                photo.MarkReady(metadata, dateTime.UtcNow);
            }

            job.Complete(dateTime.UtcNow);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            photo.MarkFailed(ex.Message, dateTime.UtcNow);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task ProcessVideoAsync(Photo photo, Stream original, CancellationToken cancellationToken)
    {
        var processed = await videoProcessor.ProcessAsync(original, cancellationToken);
        var metadata = new PhotoMetadata(
            processed.Info.Width, processed.Info.Height, processed.Info.TakenAt,
            null, null, null, null, processed.Info.DurationSeconds);

        // The original video was placed by the presigned PUT; only the row is needed.
        await variants.AddAsync(
            PhotoVariant.Create(
                photo.Id, VariantKind.Original, photo.OriginalBlobPath,
                metadata.Width, metadata.Height, photo.SizeBytes,
                VariantFormats.FromMime(photo.MimeType), dateTime.UtcNow),
            cancellationToken);

        // The poster frame feeds the regular image pipeline, so videos get the same
        // Preview/Thumbnail sizes as photos.
        foreach (var kind in new[] { VariantKind.Preview, VariantKind.Thumbnail })
        {
            processed.Poster.Content.Position = 0;
            await StoreDerivedVariantAsync(photo, kind, processed.Poster.Content, cancellationToken);
        }

        photo.MarkReady(metadata, dateTime.UtcNow);
    }

    private async Task StoreVariantAsync(
        Photo photo,
        VariantKind kind,
        PhotoMetadata metadata,
        Stream original,
        CancellationToken cancellationToken)
    {
        if (kind == VariantKind.Original)
        {
            await variants.AddAsync(
                PhotoVariant.Create(
                    photo.Id, kind, photo.OriginalBlobPath,
                    metadata.Width, metadata.Height, photo.SizeBytes,
                    VariantFormats.FromMime(photo.MimeType), dateTime.UtcNow),
                cancellationToken);
            return;
        }

        await StoreDerivedVariantAsync(photo, kind, original, cancellationToken);
    }

    private async Task StoreDerivedVariantAsync(
        Photo photo,
        VariantKind kind,
        Stream content,
        CancellationToken cancellationToken)
    {
        var output = await generator.GenerateAsync(content, kind, cancellationToken);
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
}
