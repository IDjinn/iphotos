using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

/// <summary>
/// Processes a claimed variant job: applies the owner's storage-saver preference when
/// needed (compress/transcode to the saver caps), extracts indexing metadata (EXIF for
/// photos, ffprobe/ffmpeg for videos), generates the preview/thumbnail variants, stores
/// them and moves the media to Ready. Executed by the iPhotos.Worker background service.
/// </summary>
public sealed class VariantProcessingHandler(
    IPhotoRepository photos,
    IVariantRepository variants,
    IUserRepository users,
    IBlobStorage blobStorage,
    IContentHasher contentHasher,
    IImageVariantGenerator generator,
    IExifExtractor exifExtractor,
    IVideoProcessor videoProcessor,
    IImageCompressor imageCompressor,
    IVideoCompressor videoCompressor,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    Microsoft.Extensions.Options.IOptions<UploadOptions> uploadOptions)
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
            // stream (delete-on-close temp file), so saver compression, metadata,
            // preview and thumbnail reuse it instead of re-fetching from storage.
            await using var original = await blobStorage.OpenReadAsync(photo.OriginalBlobPath, cancellationToken);
            await variants.DeleteByPhotoAsync(photo.Id, cancellationToken);

            var stored = await ApplyStorageSaverAsync(photo, original, cancellationToken);

            if (photo.MediaType == MediaType.Video)
            {
                await ProcessVideoAsync(photo, stored, cancellationToken);
            }
            else
            {
                var metadata = await exifExtractor.ExtractAsync(stored, cancellationToken);

                foreach (var kind in new[] { VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail })
                {
                    stored.Position = 0;
                    await StoreVariantAsync(photo, kind, metadata, stored, cancellationToken);
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

    /// <summary>
    /// Storage-saver modes compress/transcode files over the saver caps before variants
    /// are derived: the compressed result becomes the stored original (blob path, hash,
    /// size and mime updated) and the uploaded bytes are dropped. Files at or below the
    /// cap (and original-quality users) pass through untouched. A file that cannot reach
    /// its budget keeps the original bytes — the photo still becomes Ready rather than
    /// failing the whole job over a saver nicety.
    /// </summary>
    private async Task<Stream> ApplyStorageSaverAsync(Photo photo, Stream original, CancellationToken cancellationToken)
    {
        var user = await users.GetByIdAsync(photo.OwnerId, cancellationToken);
        if (user is null || user.UploadQuality != UploadQualities.StorageSaver)
        {
            return original;
        }

        var (imageCap, videoCap) = uploadOptions.Value.CapsFor(user.Plan, UploadQualities.StorageSaver);
        var isVideo = photo.MediaType == MediaType.Video;
        var cap = isVideo ? videoCap : imageCap;
        if (cap <= 0 || photo.SizeBytes <= cap)
        {
            return original;
        }

        Stream compressed;
        try
        {
            original.Position = 0;
            compressed = isVideo
                ? await videoCompressor.CompressToFitAsync(
                    original, cap, uploadOptions.Value.SaverVideoMaxHeight, cancellationToken)
                : await imageCompressor.CompressToFitAsync(original, cap, cancellationToken);
        }
        catch (InvalidImageException)
        {
            return original;
        }

        // The compressors always emit JPEG/MP4, so the stored name, mime and hash
        // follow the compressed bytes (same semantics the in-flight path had).
        var newMime = isVideo ? "video/mp4" : "image/jpeg";
        var newPath = BlobPaths.Original(photo.OwnerId, photo.Id, isVideo ? "video.mp4" : "photo.jpg");

        compressed.Position = 0;
        var hash = contentHasher.ComputeHash(compressed);

        compressed.Position = 0;
        await blobStorage.PutAsync(newPath, compressed, cancellationToken);

        var oldPath = photo.OriginalBlobPath;
        photo.OriginalBlobPath = newPath;
        photo.MimeType = newMime;
        photo.SizeBytes = compressed.Length;
        photo.ContentHash = hash;
        photo.MarkSaverStored(dateTime.UtcNow);

        // Blob paths embed the photo id, so the replaced blob is exclusively owned by
        // this row; drop it only after the compressed bytes are durable.
        if (oldPath != newPath)
        {
            try
            {
                await blobStorage.DeleteAsync(oldPath, cancellationToken);
            }
            catch (FileNotFoundException)
            {
                // Retry after a partial failure — already deleted.
            }
        }

        return compressed;
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
