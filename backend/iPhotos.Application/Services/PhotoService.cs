using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

public static class SupportedImageTypes
{
    public static readonly IReadOnlySet<string> MimeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp",
    };
}

public static class SupportedVideoTypes
{
    public static readonly IReadOnlySet<string> MimeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4",       // .mp4, .m4v
        "video/quicktime", // .mov
        "video/webm",
        "video/x-msvideo",
        "video/3gpp",
    };
}

public static class SupportedMediaTypes
{
    private static readonly string SupportedList =
        $"{string.Join(", ", SupportedImageTypes.MimeTypes)}, {string.Join(", ", SupportedVideoTypes.MimeTypes)}";

    public static void EnsureSupported(string contentType)
    {
        if (!SupportedImageTypes.MimeTypes.Contains(contentType)
            && !SupportedVideoTypes.MimeTypes.Contains(contentType))
        {
            throw new ValidationException($"Unsupported content type '{contentType}'. Supported: {SupportedList}.", ErrorCodes.PhotosUnsupportedContentType)
            {
                Params = new Dictionary<string, string> { ["contentType"] = contentType, ["supported"] = SupportedList },
            };
        }
    }

    public static MediaType KindOf(string contentType) =>
        SupportedVideoTypes.MimeTypes.Contains(contentType) ? MediaType.Video : MediaType.Photo;
}

public sealed record VariantFile(string BlobPath, string ContentType, long SizeBytes, string ContentHash);

/// <summary>
/// Catalog fields seeded by an import (Google Takeout sidecars or date folders) before
/// the variant worker runs; EXIF only fills what the seed leaves null. All fields are
/// optional and independently ignored when absent.
/// </summary>
public sealed record PhotoImportSeed(
    DateTimeOffset? TakenAt,
    double? GpsLatitude,
    double? GpsLongitude,
    string? Title,
    string? Description)
{
    public bool HasAny => TakenAt is not null || GpsLatitude is not null
        || GpsLongitude is not null || Title is not null || Description is not null;

    public static PhotoImportSeed Empty { get; } = new(null, null, null, null, null);
}

public sealed class PhotoService(
    IPhotoRepository photos,
    IVariantRepository variants,
    IVariantJobRepository jobs,
    IUserRepository users,
    IBlobStorage blobStorage,
    IContentHasher contentHasher,
    IImageVariantGenerator variantGenerator,
    IExifExtractor exifExtractor,
    IVideoProcessor videoProcessor,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    MlJobEnqueuer mlJobs,
    IMlInputCache inputCache,
    Microsoft.Extensions.Options.IOptions<UploadOptions> uploadOptions)
{
    /// <summary>Floor for presigned PUT expiries handed out by upload tickets.</summary>
    private static readonly TimeSpan UploadUrlMinLifetime = TimeSpan.FromMinutes(15);

    /// <summary>Client-side multipart part size for direct uploads (each part except the
    /// last must be at least 5 MiB per the S3 contract; 32 MiB keeps a 30 GiB video at
    /// ~960 parts).</summary>
    public const long MultipartPartSizeBytes = 32L * 1024 * 1024;

    private UploadOptions UploadLimits => uploadOptions.Value;

    /// <summary>
    /// Presigned PUT URLs must outlive the upload itself: slow connections uploading
    /// multi-GiB videos blow past a fixed 15-minute window. Scales with the file size
    /// at the assumed throughput, bounded by a configured ceiling.
    /// </summary>
    private TimeSpan ComputeUploadUrlExpiry(long sizeBytes)
    {
        var assumedBytesPerSecond = UploadLimits.AssumedUploadMbps * 1024 * 1024 / 8;
        var scaled = assumedBytesPerSecond > 0
            ? TimeSpan.FromSeconds(sizeBytes / assumedBytesPerSecond)
            : UploadUrlMinLifetime;
        var max = TimeSpan.FromHours(Math.Max(1, UploadLimits.UploadUrlMaxExpiryHours));
        var expiry = scaled > UploadUrlMinLifetime ? scaled : UploadUrlMinLifetime;
        return expiry > max ? max : expiry;
    }

    /// <summary>
    /// Original-quality modes reject files above the plan cap outright. Storage-saver
    /// modes never reject here — oversize files are compressed/transcoded by the
    /// variant worker after the upload, so the only hard ceiling is the quota.
    /// </summary>
    private void EnsureUploadLimit(User user, bool isVideo, long sizeBytes)
    {
        if (user.UploadQuality != UploadQualities.Original)
        {
            return;
        }

        var (imageCap, videoCap) = UploadLimits.CapsFor(user.Plan, user.UploadQuality);
        var cap = isVideo ? videoCap : imageCap;
        if (cap > 0 && sizeBytes > cap)
        {
            throw SizeLimitExceeded(isVideo, cap);
        }
    }

    private static ValidationException SizeLimitExceeded(bool isVideo, long cap) =>
        new(
            $"{(isVideo ? "Video" : "Image")} exceeds the {cap / (1024 * 1024)} MB limit of your plan.",
            ErrorCodes.PhotosSizeLimitExceeded)
        {
            Params = new Dictionary<string, string>
            {
                ["limitMb"] = (cap / (1024 * 1024)).ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["mediaKind"] = isVideo ? "video" : "photo",
            },
        };

    private static QuotaExceededException QuotaExceeded(long incomingBytes, long quotaBytes) =>
        new($"Upload of {incomingBytes} bytes would exceed the storage quota of {quotaBytes} bytes.")
        {
            Params = new Dictionary<string, string>
            {
                ["quotaBytes"] = quotaBytes.ToString(System.Globalization.CultureInfo.InvariantCulture),
            },
        };

    public async Task<UploadTicket> CreateUploadTicketAsync(
        Guid ownerId,
        string fileName,
        string contentType,
        long sizeBytes,
        string contentHash,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ValidationException("File name is required.", ErrorCodes.PhotosFileNameRequired);
        }

        SupportedMediaTypes.EnsureSupported(contentType);

        if (sizeBytes <= 0)
        {
            throw new ValidationException("File size must be greater than zero.", ErrorCodes.PhotosFileSizeInvalid);
        }

        // Original-quality modes enforce their per-file cap at ticket time. Saver
        // modes accept any size the quota admits — the worker compresses later,
        // so the bytes never need to cross this API for the decision to hold.
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.", ErrorCodes.UserNotFound);
        if (user.UploadQuality == UploadQualities.Original)
        {
            var (imageCap, videoCap) = UploadLimits.CapsFor(user.Plan, user.UploadQuality);
            var cap = SupportedMediaTypes.KindOf(contentType) == MediaType.Video ? videoCap : imageCap;
            if (cap > 0 && sizeBytes > cap)
            {
                throw SizeLimitExceeded(SupportedMediaTypes.KindOf(contentType) == MediaType.Video, cap);
            }
        }

        if (string.IsNullOrWhiteSpace(contentHash))
        {
            throw new ValidationException("Content hash is required.", ErrorCodes.PhotosHashRequired);
        }

        var existing = await photos.FindByContentHashAsync(ownerId, contentHash, cancellationToken);
        if (existing is not null)
        {
            return new UploadTicket(ToDto(existing, []), Duplicated: true, UploadUrl: null, ExpiresAt: null);
        }

        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + sizeBytes > user.StorageQuotaBytes)
        {
            throw QuotaExceeded(usage.UsedBytes + sizeBytes, user.StorageQuotaBytes);
        }

        var photo = Photo.CreatePendingUpload(
            ownerId, contentHash, fileName, contentType, sizeBytes, dateTime.UtcNow,
            SupportedMediaTypes.KindOf(contentType));
        photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);

        // The ticket reserves the quota by persisting the PendingUpload row. Oversize
        // files (> 5 GB) cannot ride a single presigned PUT (the S3 hard cap), so they
        // get a multipart session whose parts the client presigns one by one; smaller
        // files keep the plain presigned PUT with bytes never crossing this API.
        var expiry = ComputeUploadUrlExpiry(sizeBytes);
        string? multipartId = null;
        if (sizeBytes >= UploadLimits.DirectMultipartThresholdBytes)
        {
            multipartId = await blobStorage.TryCreateMultipartUploadAsync(
                photo.OriginalBlobPath, contentType, cancellationToken);
            photo.MultipartUploadId = multipartId;
        }

        string? uploadUrl = null;
        if (multipartId is null)
        {
            uploadUrl = (await blobStorage.TryCreateUploadUrlAsync(
                    photo.OriginalBlobPath, expiry, contentType, cancellationToken))
                ?.Url
                ?? throw new NotSupportedException("Direct upload is not supported by the configured blob storage.");
        }

        await photos.AddAsync(photo, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new UploadTicket(
            ToDto(photo, []), Duplicated: false, uploadUrl, dateTime.UtcNow + expiry,
            multipartId, multipartId is null ? null : MultipartPartSizeBytes);
    }

    /// <summary>Presigns one part of an open multipart direct upload; null when the
    /// storage cannot presign multipart uploads.</summary>
    public async Task<BlobUploadUrl?> CreatePartUrlAsync(
        Guid ownerId,
        Guid photoId,
        int partNumber,
        CancellationToken cancellationToken = default)
    {
        if (partNumber is < 1 or > 10000)
        {
            throw new ValidationException("Part number must be between 1 and 10000.", ErrorCodes.PhotosInvalidPartNumber);
        }

        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (photo.State != PhotoState.PendingUpload)
        {
            throw new ValidationException($"Photo '{photoId}' is not awaiting an upload.", ErrorCodes.PhotosNotAwaitingUpload);
        }

        var uploadId = photo.MultipartUploadId
            ?? throw new ValidationException($"Photo '{photoId}' has no multipart upload session.", ErrorCodes.PhotosNoMultipartSession);

        return await blobStorage.TryCreatePartUrlAsync(
            photo.OriginalBlobPath, uploadId, partNumber, ComputeUploadUrlExpiry(photo.SizeBytes), cancellationToken);
    }

    /// <summary>Aborts an in-flight direct upload: cancels any multipart session and
    /// drops the reserved row immediately.</summary>
    public async Task AbortUploadAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (photo.State != PhotoState.PendingUpload)
        {
            throw new ValidationException($"Photo '{photoId}' is not awaiting an upload.", ErrorCodes.PhotosNotAwaitingUpload);
        }

        if (photo.MultipartUploadId is not null)
        {
            try
            {
                await blobStorage.AbortMultipartUploadAsync(
                    photo.OriginalBlobPath, photo.MultipartUploadId, cancellationToken);
            }
            catch (NotSupportedException)
            {
                // Provider without multipart support — nothing to abort.
            }
        }

        try
        {
            await blobStorage.DeleteAsync(photo.OriginalBlobPath, cancellationToken);
        }
        catch (FileNotFoundException)
        {
            // Nothing was uploaded yet.
        }

        await photos.DeleteAsync(photo, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<PhotoDto> CompleteUploadAsync(
        Guid ownerId,
        Guid photoId,
        CompleteUploadRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (photo.State != PhotoState.PendingUpload)
        {
            throw new ValidationException($"Photo '{photoId}' is not awaiting an upload.", ErrorCodes.PhotosNotAwaitingUpload);
        }

        if (request?.MultipartUploadId is not null && request.Parts is { Count: > 0 })
        {
            var expected = photo.MultipartUploadId;
            if (expected is not null && expected != request.MultipartUploadId)
            {
                throw new ValidationException($"Multipart upload id does not match photo '{photoId}'.", ErrorCodes.PhotosMultipartMismatch);
            }

            await blobStorage.CompleteMultipartUploadAsync(
                photo.OriginalBlobPath, request.MultipartUploadId, request.Parts, cancellationToken);
        }

        if (!await blobStorage.ExistsAsync(photo.OriginalBlobPath, cancellationToken))
        {
            throw new NotFoundException($"The file for photo '{photoId}' has not been uploaded yet.", ErrorCodes.PhotosFileNotUploaded);
        }

        photo.MultipartUploadId = null;
        photo.MarkUploadedForProcessing(dateTime.UtcNow);
        await jobs.EnqueueAsync(photo.Id, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ToDto(photo, []);
    }

    public async Task<PhotoUploadResult> UploadAsync(
        Guid ownerId,
        string fileName,
        string contentType,
        Stream content,
        PhotoImportSeed? seed = null,
        bool isLive = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ValidationException("File name is required.", ErrorCodes.PhotosFileNameRequired);
        }

        SupportedMediaTypes.EnsureSupported(contentType);

        if (SupportedVideoTypes.MimeTypes.Contains(contentType))
        {
            return await UploadVideoAsync(ownerId, fileName, contentType, content, seed, cancellationToken);
        }

        var content2 = EnsureSeekable(content);
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.", ErrorCodes.UserNotFound);

        EnsureUploadLimit(user, isVideo: false, content2.Length);

        // The bytes are stored as uploaded; storage-saver compression happens in the
        // variant worker (same path as direct uploads and zip imports).
        long storedLength = content2.Length;
        Stream stored = content2;

        stored.Position = 0;
        var hash = contentHasher.ComputeHash(stored);

        var existing = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
        if (existing is not null)
        {
            // A re-import that now carries the paired motion file upgrades the
            // still-only row (e.g. the same Takeout archive imported in two parts).
            if (isLive && !existing.IsLive)
            {
                existing.IsLive = true;
                await unitOfWork.SaveChangesAsync(cancellationToken);
            }

            return new PhotoUploadResult(ToDto(existing, []), Duplicated: true);
        }

        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + storedLength > user.StorageQuotaBytes)
        {
            throw QuotaExceeded(usage.UsedBytes + storedLength, user.StorageQuotaBytes);
        }

        var photo = Photo.Create(ownerId, hash, fileName, contentType, storedLength, dateTime.UtcNow);
        photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);
        // Live-photo pairs (Apple convention) arrive from the zip importer with the
        // still first; the paired motion file is skipped by the importer itself.
        photo.IsLive = isLive;
        if (seed is { HasAny: true })
        {
            photo.SeedImportMetadata(seed.TakenAt, seed.GpsLatitude, seed.GpsLongitude, seed.Title, seed.Description);
        }

        // The upload stream is already seekable in memory, so indexing and the derived
        // variants are produced here instead of the worker re-downloading the original.
        // Variant jobs remain only for the direct-upload flow, where the backend never
        // sees the bytes.
        photo.MarkProcessing(dateTime.UtcNow);
        var metadata = await exifExtractor.ExtractAsync(stored, cancellationToken);

        stored.Position = 0;
        var preview = await variantGenerator.GenerateAsync(stored, VariantKind.Preview, cancellationToken);
        stored.Position = 0;
        var thumbnail = await variantGenerator.GenerateAsync(stored, VariantKind.Thumbnail, cancellationToken);
        stored.Position = 0;

        await blobStorage.PutAsync(photo.OriginalBlobPath, stored, cancellationToken);
        var previewPath = BlobPaths.Preview(ownerId, photo.Id);
        var thumbnailPath = BlobPaths.Thumbnail(ownerId, photo.Id);

        // Stage the derived variants for the AI pipelines (doc 18 §6.2) before the
        // PUTs consume the streams: the ML jobs are claimed by the worker process,
        // so they consume this local copy instead of re-downloading the blobs.
        await inputCache.SaveAsync(photo.Id, MlInputKind.Preview, preview.Content, cancellationToken);
        await inputCache.SaveAsync(photo.Id, MlInputKind.Thumbnail, thumbnail.Content, cancellationToken);

        await blobStorage.PutAsync(previewPath, preview.Content, cancellationToken);
        await blobStorage.PutAsync(thumbnailPath, thumbnail.Content, cancellationToken);

        // Photo row goes into the context before its variants: PhotoVariant carries
        // only the FK value (no navigation), so EF inserts in add order and the
        // variant rows would violate the FK if they were tracked first.
        await photos.AddAsync(photo, cancellationToken);

        var variantRows = new[]
        {
            PhotoVariant.Create(
                photo.Id, VariantKind.Original, photo.OriginalBlobPath,
                metadata.Width, metadata.Height, photo.SizeBytes,
                VariantFormats.FromMime(photo.MimeType), dateTime.UtcNow),
            PhotoVariant.Create(
                photo.Id, VariantKind.Preview, previewPath,
                preview.Width, preview.Height, preview.SizeBytes, preview.Format, dateTime.UtcNow),
            PhotoVariant.Create(
                photo.Id, VariantKind.Thumbnail, thumbnailPath,
                thumbnail.Width, thumbnail.Height, thumbnail.SizeBytes, thumbnail.Format, dateTime.UtcNow),
        };
        foreach (var variant in variantRows)
        {
            await variants.AddAsync(variant, cancellationToken);
        }

        photo.MarkReady(metadata, dateTime.UtcNow);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        // The photo is Ready with a stored preview — enter the AI pipelines (doc 18 §6.1).
        await mlJobs.EnqueueForReadyPhotoAsync(photo, cancellationToken);

        return new PhotoUploadResult(ToDto(photo, variantRows.Select(ToVariantDto).ToList()), Duplicated: false);
    }

    /// <summary>
    /// Video ingest (multipart and zip import): the bytes go to a temp file (seekable,
    /// out of the large-object heap), ffprobe/ffmpeg produce the metadata and the poster
    /// frame, and the derived Preview/Thumbnail variants are the poster resized by the
    /// regular image pipeline. The original is never transcoded.
    /// </summary>
    private async Task<PhotoUploadResult> UploadVideoAsync(
        Guid ownerId,
        string fileName,
        string contentType,
        Stream content,
        PhotoImportSeed? seed,
        CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"iphotos-upload-{Guid.NewGuid():N}{Path.GetExtension(fileName)}");
        try
        {
            await using (var target = File.Create(tempPath))
            {
                await content.CopyToAsync(target, cancellationToken);
            }

            var user = await users.GetByIdAsync(ownerId, cancellationToken)
                ?? throw new NotFoundException($"User '{ownerId}' was not found.", ErrorCodes.UserNotFound);

            EnsureUploadLimit(user, isVideo: true, new FileInfo(tempPath).Length);

            await using var videoFile = File.OpenRead(tempPath);
            var hash = contentHasher.ComputeHash(videoFile);

            var existing = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
            if (existing is not null)
            {
                return new PhotoUploadResult(ToDto(existing, []), Duplicated: true);
            }

            var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
            if (usage.UsedBytes + videoFile.Length > user.StorageQuotaBytes)
            {
                throw QuotaExceeded(usage.UsedBytes + videoFile.Length, user.StorageQuotaBytes);
            }

            var photo = Photo.Create(ownerId, hash, fileName, contentType, videoFile.Length, dateTime.UtcNow, MediaType.Video);
            photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);
            if (seed is { HasAny: true })
            {
                photo.SeedImportMetadata(seed.TakenAt, seed.GpsLatitude, seed.GpsLongitude, seed.Title, seed.Description);
            }

            photo.MarkProcessing(dateTime.UtcNow);
            var processed = await videoProcessor.ProcessAsync(videoFile, cancellationToken);

            videoFile.Position = 0;
            await blobStorage.PutAsync(photo.OriginalBlobPath, videoFile, cancellationToken);

            var previewPath = BlobPaths.Preview(ownerId, photo.Id);
            var thumbnailPath = BlobPaths.Thumbnail(ownerId, photo.Id);
            processed.Poster.Content.Position = 0;
            var preview = await variantGenerator.GenerateAsync(processed.Poster.Content, VariantKind.Preview, cancellationToken);
            processed.Poster.Content.Position = 0;
            var thumbnail = await variantGenerator.GenerateAsync(processed.Poster.Content, VariantKind.Thumbnail, cancellationToken);
            await blobStorage.PutAsync(previewPath, preview.Content, cancellationToken);
            await blobStorage.PutAsync(thumbnailPath, thumbnail.Content, cancellationToken);

            // Photo row goes into the context before its variants: PhotoVariant carries
            // only the FK value (no navigation), so EF inserts in add order and the
            // variant rows would violate the FK if they were tracked first.
            await photos.AddAsync(photo, cancellationToken);

            var metadata = new PhotoMetadata(
                processed.Info.Width, processed.Info.Height, processed.Info.TakenAt,
                null, null, null, null, processed.Info.DurationSeconds);
            var variantRows = new[]
            {
                PhotoVariant.Create(
                    photo.Id, VariantKind.Original, photo.OriginalBlobPath,
                    metadata.Width, metadata.Height, photo.SizeBytes,
                    VariantFormats.FromMime(photo.MimeType), dateTime.UtcNow),
                PhotoVariant.Create(
                    photo.Id, VariantKind.Preview, previewPath,
                    preview.Width, preview.Height, preview.SizeBytes, preview.Format, dateTime.UtcNow),
                PhotoVariant.Create(
                    photo.Id, VariantKind.Thumbnail, thumbnailPath,
                    thumbnail.Width, thumbnail.Height, thumbnail.SizeBytes, thumbnail.Format, dateTime.UtcNow),
            };
            foreach (var variant in variantRows)
            {
                await variants.AddAsync(variant, cancellationToken);
            }

            photo.MarkReady(metadata, dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            return new PhotoUploadResult(ToDto(photo, variantRows.Select(ToVariantDto).ToList()), Duplicated: false);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    /// <summary>
    /// Attaches a Live Photo motion clip (the iPhone paired .mov) to a photo:
    /// stores it as the <see cref="VariantKind.Motion"/> variant, flags the row
    /// live and records the clip length. The still's bytes and metadata are
    /// untouched; a previously attached clip is replaced.
    /// </summary>
    public async Task<PhotoDto> AttachMotionAsync(
        Guid ownerId,
        Guid photoId,
        string fileName,
        string contentType,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (photo.MediaType != MediaType.Photo)
        {
            throw new ValidationException($"Photo '{photoId}' is a video and cannot take a motion clip.", ErrorCodes.PhotosNotLive);
        }

        SupportedMediaTypes.EnsureSupported(contentType);
        if (!SupportedVideoTypes.MimeTypes.Contains(contentType))
        {
            throw new ValidationException(
                $"A Live Photo motion file must be a video — got '{contentType}'.", ErrorCodes.PhotosUnsupportedContentType);
        }

        var seekable = EnsureSeekable(content);
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.", ErrorCodes.UserNotFound);
        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + seekable.Length > user.StorageQuotaBytes)
        {
            throw QuotaExceeded(usage.UsedBytes + seekable.Length, user.StorageQuotaBytes);
        }

        await AttachMotionCoreAsync(photo, fileName, contentType, seekable, cancellationToken);
        return ToDto(photo, []);
    }

    /// <summary>
    /// Live Photo "Set as Key Photo": extracts the motion frame at the given offset
    /// and replaces the still with it — new original bytes, regenerated preview and
    /// thumbnail, refreshed ML inputs. The motion clip itself is kept.
    /// </summary>
    public async Task<PhotoDto> SetKeyPhotoAsync(
        Guid ownerId,
        Guid photoId,
        double offsetSeconds,
        CancellationToken cancellationToken = default)
    {
        if (!double.IsFinite(offsetSeconds) || offsetSeconds < 0)
        {
            throw new ValidationException("Frame offset must be zero or a positive number of seconds.");
        }

        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (photo.MediaType != MediaType.Photo || !photo.IsLive)
        {
            throw new ValidationException($"Photo '{photoId}' is not a Live Photo.", ErrorCodes.PhotosNotLive);
        }

        if (photo.State != PhotoState.Ready)
        {
            throw new ValidationException($"Photo '{photoId}' is still processing — try again once it is Ready.");
        }

        if (photo.DurationSeconds is { } duration && offsetSeconds > duration)
        {
            throw new ValidationException(
                $"Frame offset {offsetSeconds.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}s " +
                $"is beyond the {duration.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}s motion clip.");
        }

        var motion = await variants.FindByKindAsync(photoId, VariantKind.Motion, cancellationToken)
            ?? throw new NotFoundException(
                $"Motion clip for photo '{photoId}' is not available.", ErrorCodes.PhotosVariantNotReady)
            {
                Params = new Dictionary<string, string> { ["kind"] = "motion" },
            };

        await using var motionStream = await blobStorage.OpenReadAsync(motion.BlobPath, cancellationToken);
        var frame = await videoProcessor.ExtractFrameAsync(motionStream, offsetSeconds, cancellationToken);

        // The extracted frame becomes the stored still — hash dedup still applies.
        frame.Content.Position = 0;
        var hash = contentHasher.ComputeHash(frame.Content);
        var clash = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
        if (clash is not null && clash.Id != photo.Id)
        {
            throw new ValidationException(
                "That frame matches another photo already in your library.", ErrorCodes.PhotosKeyFrameConflict);
        }

        // The original blob path bakes in the file extension: extracted frames are
        // JPEG, so anything not named .jpg/.jpeg is renamed to keep path and bytes
        // consistent (the old path's blob is removed after the new one lands).
        var oldPath = photo.OriginalBlobPath;
        var oldExtension = Path.GetExtension(photo.FileName);
        var newFileName = oldExtension is ".jpg" or ".jpeg"
            ? photo.FileName
            : Path.ChangeExtension(photo.FileName, ".jpg");
        var newPath = BlobPaths.Original(ownerId, photoId, newFileName);
        var newMime = "image/jpeg";

        frame.Content.Position = 0;
        var preview = await variantGenerator.GenerateAsync(frame.Content, VariantKind.Preview, cancellationToken);
        frame.Content.Position = 0;
        var thumbnail = await variantGenerator.GenerateAsync(frame.Content, VariantKind.Thumbnail, cancellationToken);
        frame.Content.Position = 0;

        await blobStorage.PutAsync(newPath, frame.Content, cancellationToken);
        var previewPath = BlobPaths.Preview(ownerId, photoId);
        var thumbnailPath = BlobPaths.Thumbnail(ownerId, photoId);
        await blobStorage.PutAsync(previewPath, preview.Content, cancellationToken);
        await blobStorage.PutAsync(thumbnailPath, thumbnail.Content, cancellationToken);
        if (!string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
        {
            await blobStorage.DeleteAsync(oldPath, cancellationToken);
        }

        // ML inputs follow the displayed frame so any future re-index sees the new
        // still; existing labels/faces are not re-enqueued (v1).
        preview.Content.Position = 0;
        await inputCache.SaveAsync(photoId, MlInputKind.Preview, preview.Content, cancellationToken);
        await inputCache.SaveAsync(photoId, MlInputKind.Thumbnail, thumbnail.Content, cancellationToken);

        photo.ReplaceOriginalBytes(hash, newFileName, newMime, frame.Content.Length, dateTime.UtcNow);
        photo.OriginalBlobPath = newPath;

        await UpdateVariantRowAsync(photoId, VariantKind.Original, newPath,
            photo.Width ?? 0, photo.Height ?? 0, frame.Content.Length,
            VariantFormats.FromMime(newMime), cancellationToken);
        await UpdateVariantRowAsync(photoId, VariantKind.Preview, previewPath,
            preview.Width, preview.Height, preview.SizeBytes, preview.Format, cancellationToken);
        await UpdateVariantRowAsync(photoId, VariantKind.Thumbnail, thumbnailPath,
            thumbnail.Width, thumbnail.Height, thumbnail.SizeBytes, thumbnail.Format, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(photo, []);
    }

    /// <summary>
    /// Converts video rows that are actually Live Photo motion files (imported as
    /// standalone videos by builds before pairing existed): their bytes become the
    /// still's Motion variant and the video row is deleted. Matches on file-name
    /// stem — Apple pairs share it ("IMG_1234.HEIC" + "IMG_1234.mov"). Idempotent.
    /// </summary>
    public async Task<int> AdoptPairedMotionVideosAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var stills = (await photos.ListLiveForOwnerAsync(ownerId, cancellationToken))
            .Where(p => p.MediaType == MediaType.Photo)
            .GroupBy(p => StemOf(p.FileName))
            .Where(g => g.Key.Length > 0)
            .ToDictionary(g => g.Key, g => g.OrderBy(p => p.CreatedAt).First());
        if (stills.Count == 0)
        {
            return 0;
        }

        var adopted = 0;
        foreach (var video in await photos.ListVideosForOwnerAsync(ownerId, cancellationToken))
        {
            var stem = StemOf(video.FileName);
            if (stem.Length == 0 || !stills.TryGetValue(stem, out var still) || still.Id == video.Id)
            {
                continue;
            }

            // A still that already carries a clip (this import just attached one)
            // only needs its leftover video row removed — no byte rewrite.
            var hasMotion = await variants.FindByKindAsync(still.Id, VariantKind.Motion, cancellationToken) is not null;
            if (!hasMotion)
            {
                try
                {
                    await using var stream = await blobStorage.OpenReadAsync(video.OriginalBlobPath, cancellationToken);
                    var seekable = EnsureSeekable(stream);
                    await AttachMotionCoreAsync(still, video.FileName, video.MimeType, seekable, cancellationToken);
                }
                catch (Exception ex) when (ex is InvalidImageException or FileNotFoundException or KeyNotFoundException)
                {
                    // The bytes are not a decodable clip (or are gone) — leave the row alone.
                    continue;
                }
            }

            await DeletePhotoWithBlobsAsync(video, cancellationToken);
            adopted++;
        }

        return adopted;
    }

    /// <summary>Motion-clip storage shared by attach (import/API) and adoption: puts the
    /// blob, upserts the Motion variant and flags the photo live with the clip length.</summary>
    private async Task AttachMotionCoreAsync(
        Photo photo, string fileName, string contentType, Stream content, CancellationToken cancellationToken)
    {
        content.Position = 0;
        var info = await videoProcessor.ProbeAsync(content, cancellationToken);

        var blobPath = BlobPaths.Motion(photo.OwnerId, photo.Id, fileName);
        var existing = await variants.FindByKindAsync(photo.Id, VariantKind.Motion, cancellationToken);
        if (existing is not null && existing.BlobPath != blobPath)
        {
            await blobStorage.DeleteAsync(existing.BlobPath, cancellationToken);
        }

        content.Position = 0;
        await blobStorage.PutAsync(blobPath, content, cancellationToken);

        if (existing is not null)
        {
            existing.BlobPath = blobPath;
            existing.SizeBytes = content.Length;
            existing.Format = VariantFormats.FromMime(contentType);
        }
        else
        {
            await variants.AddAsync(
                PhotoVariant.Create(photo.Id, VariantKind.Motion, blobPath, 0, 0, content.Length,
                    VariantFormats.FromMime(contentType), dateTime.UtcNow),
                cancellationToken);
        }

        photo.AttachMotion(info.DurationSeconds, dateTime.UtcNow);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Mutates one tracked variant row (dimensions/size follow new bytes).</summary>
    private async Task UpdateVariantRowAsync(
        Guid photoId, VariantKind kind, string blobPath,
        int width, int height, long sizeBytes, string format,
        CancellationToken cancellationToken)
    {
        var row = await variants.FindByKindAsync(photoId, kind, cancellationToken);
        if (row is null)
        {
            await variants.AddAsync(PhotoVariant.Create(photoId, kind, blobPath, width, height, sizeBytes, format, dateTime.UtcNow), cancellationToken);
            return;
        }

        row.BlobPath = blobPath;
        row.Width = width;
        row.Height = height;
        row.SizeBytes = sizeBytes;
        row.Format = format;
    }

    /// <summary>Case-insensitive file-name stem (Takeout pairs share it across folders).</summary>
    private static string StemOf(string fileName) =>
        Path.GetFileNameWithoutExtension(fileName).ToLowerInvariant();

    public async Task<PhotoDto> GetAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        var photoVariants = await variants.ListByPhotoAsync(photoId, cancellationToken);
        return ToDto(photo, photoVariants.Select(ToVariantDto).ToList());
    }

    public async Task<PagedResult<PhotoDto>> ListAsync(Guid ownerId, PhotoFilter filter, CancellationToken cancellationToken = default)
    {
        var normalized = filter with
        {
            OwnerId = ownerId,
            Page = Math.Max(1, filter.Page),
            PageSize = Math.Clamp(filter.PageSize, 1, 100),
        };

        var page = await photos.ListAsync(normalized, cancellationToken);
        return new PagedResult<PhotoDto>(
            page.Items.Select(p => ToDto(p, [])).ToList(),
            page.Page,
            page.PageSize,
            page.TotalCount);
    }

    public Task<IReadOnlyList<PhotoMonthBucket>> ListMonthBucketsAsync(
        Guid ownerId, string? sortBy, MediaType? mediaType, bool? isLive = null, CancellationToken cancellationToken = default) =>
        photos.ListMonthBucketsAsync(ownerId, sortBy, mediaType, isLive, cancellationToken);

    public async Task DeleteAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        await DeletePhotoWithBlobsAsync(photo, cancellationToken);
    }

    /// <summary>Removes a photo row together with every variant blob (adoption reuses
    /// it when a converted motion-video row leaves the library).</summary>
    private async Task DeletePhotoWithBlobsAsync(Photo photo, CancellationToken cancellationToken)
    {
        var photoVariants = await variants.ListByPhotoAsync(photo.Id, cancellationToken);
        var blobsToDelete = photoVariants
            .Select(v => v.BlobPath)
            .Append(photo.OriginalBlobPath)
            .Distinct()
            .ToList();

        foreach (var blobPath in blobsToDelete)
        {
            await blobStorage.DeleteAsync(blobPath, cancellationToken);
        }

        await variants.DeleteByPhotoAsync(photo.Id, cancellationToken);
        await photos.DeleteAsync(photo, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<UsageSummary> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.", ErrorCodes.UserNotFound);

        var stats = await photos.GetUsageAsync(ownerId, cancellationToken);
        return new UsageSummary(stats.UsedBytes, user.StorageQuotaBytes, stats.PhotoCount, stats.VariantCount, stats.LivePhotoCount);
    }

    public async Task<VariantFile> GetVariantFileAsync(
        Guid ownerId,
        Guid photoId,
        VariantKind kind,
        CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);

        if (kind == VariantKind.Original)
        {
            return new VariantFile(photo.OriginalBlobPath, photo.MimeType, photo.SizeBytes, photo.ContentHash);
        }

        var variant = (await variants.ListByPhotoAsync(photoId, cancellationToken))
            .FirstOrDefault(v => v.Kind == kind)
            ?? throw new NotFoundException($"{kind} variant for photo '{photoId}' is not ready yet.", ErrorCodes.PhotosVariantNotReady)
            {
                Params = new Dictionary<string, string> { ["kind"] = kind.ToString().ToLowerInvariant() },
            };

        return new VariantFile(variant.BlobPath, MimeFromFormat(variant.Format), variant.SizeBytes, photo.ContentHash);
    }

    private static Stream EnsureSeekable(Stream content) =>
        content.CanSeek ? content : ContentIntoMemory(content);

    private static MemoryStream ContentIntoMemory(Stream content)
    {
        var buffer = new MemoryStream();
        content.CopyTo(buffer);
        buffer.Seek(0, SeekOrigin.Begin);
        return buffer;
    }

    private static string MimeFromFormat(string format) => format.ToLowerInvariant() switch
    {
        "jpeg" or "jpg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "3gp" => "video/3gpp",
        _ => "application/octet-stream",
    };

    private static PhotoDto ToDto(Photo photo, IReadOnlyList<VariantDto> photoVariants) =>
        PhotoDto.From(photo, photoVariants);

    private static VariantDto ToVariantDto(PhotoVariant variant) =>
        new(variant.Kind, variant.BlobPath, variant.Width, variant.Height, variant.SizeBytes, variant.Format);
}
