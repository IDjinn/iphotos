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
            throw new ValidationException($"Unsupported content type '{contentType}'. Supported: {SupportedList}.");
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
    IImageCompressor imageCompressor,
    IVideoCompressor videoCompressor,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    Microsoft.Extensions.Options.IOptions<UploadOptions> uploadOptions)
{
    /// <summary>Lifetime of presigned PUT URLs handed out by upload tickets.</summary>
    private static readonly TimeSpan UploadUrlLifetime = TimeSpan.FromMinutes(15);

    private UploadOptions UploadLimits => uploadOptions.Value;

    /// <summary>
    /// Paid plans reject files above their cap. Free plans never reject here —
    /// oversize files are compressed/transcoded downstream to the free cap.
    /// </summary>
    private void EnsurePlanLimit(string plan, bool isVideo, long sizeBytes)
    {
        if (plan == "free") return;
        var cap = isVideo ? UploadLimits.PaidMaxVideoBytes : UploadLimits.PaidMaxImageBytes;
        if (cap > 0 && sizeBytes > cap)
        {
            throw new ValidationException(
                $"{(isVideo ? "Video" : "Image")} exceeds the {cap / (1024 * 1024)} MB limit of your plan.");
        }
    }

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
            throw new ValidationException("File name is required.");
        }

        SupportedMediaTypes.EnsureSupported(contentType);

        if (sizeBytes <= 0)
        {
            throw new ValidationException("File size must be greater than zero.");
        }

        // Direct upload never sees the bytes, so free-plan compression cannot
        // happen here: the ticket ceiling is the plan cap in both tiers.
        var plan = (await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.")).Plan;
        var ticketCap = SupportedMediaTypes.KindOf(contentType) == MediaType.Video
            ? (plan == "free" ? UploadLimits.FreeMaxVideoBytes : UploadLimits.PaidMaxVideoBytes)
            : (plan == "free" ? UploadLimits.FreeMaxImageBytes : UploadLimits.PaidMaxImageBytes);
        if (ticketCap > 0 && sizeBytes > ticketCap)
        {
            throw new ValidationException(
                $"File exceeds the {ticketCap / (1024 * 1024)} MB upload limit of your plan.");
        }

        if (string.IsNullOrWhiteSpace(contentHash))
        {
            throw new ValidationException("Content hash is required.");
        }

        var existing = await photos.FindByContentHashAsync(ownerId, contentHash, cancellationToken);
        if (existing is not null)
        {
            return new UploadTicket(ToDto(existing, []), Duplicated: true, UploadUrl: null, ExpiresAt: null);
        }

        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.");

        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + sizeBytes > user.StorageQuotaBytes)
        {
            throw new QuotaExceededException(
                $"Upload of {sizeBytes} bytes would exceed the storage quota of {user.StorageQuotaBytes} bytes.");
        }

        var photo = Photo.CreatePendingUpload(
            ownerId, contentHash, fileName, contentType, sizeBytes, dateTime.UtcNow,
            SupportedMediaTypes.KindOf(contentType));
        photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);

        // The ticket reserves the quota by persisting the PendingUpload row; the presigned
        // PUT lets the client place the bytes in storage without proxying them through here.
        var uploadUrl = await blobStorage.TryCreateUploadUrlAsync(
                photo.OriginalBlobPath, UploadUrlLifetime, contentType, cancellationToken)
            ?? throw new NotSupportedException("Direct upload is not supported by the configured blob storage.");

        await photos.AddAsync(photo, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new UploadTicket(ToDto(photo, []), Duplicated: false, uploadUrl.Url, uploadUrl.ExpiresAt);
    }

    public async Task<PhotoDto> CompleteUploadAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.");

        if (photo.State != PhotoState.PendingUpload)
        {
            throw new ValidationException($"Photo '{photoId}' is not awaiting an upload.");
        }

        if (!await blobStorage.ExistsAsync(photo.OriginalBlobPath, cancellationToken))
        {
            throw new NotFoundException($"The file for photo '{photoId}' has not been uploaded yet.");
        }

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
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ValidationException("File name is required.");
        }

        SupportedMediaTypes.EnsureSupported(contentType);

        if (SupportedVideoTypes.MimeTypes.Contains(contentType))
        {
            return await UploadVideoAsync(ownerId, fileName, contentType, content, seed, cancellationToken);
        }

        var content2 = EnsureSeekable(content);
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.");

        EnsurePlanLimit(user.Plan, isVideo: false, content2.Length);

        // Free-plan oversize images are compressed to the plan cap; the stored
        // bytes (and their dedup hash) are the compressed result.
        long storedLength = content2.Length;
        Stream stored = content2;
        var freeImageCap = UploadLimits.FreeMaxImageBytes;
        if (user.Plan == "free" && freeImageCap > 0 && storedLength > freeImageCap)
        {
            stored = await imageCompressor.CompressToFitAsync(content2, freeImageCap, cancellationToken);
            storedLength = stored.Length;
        }

        stored.Position = 0;
        var hash = contentHasher.ComputeHash(stored);

        var existing = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
        if (existing is not null)
        {
            return new PhotoUploadResult(ToDto(existing, []), Duplicated: true);
        }

        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + storedLength > user.StorageQuotaBytes)
        {
            throw new QuotaExceededException(
                $"Upload of {storedLength} bytes would exceed the storage quota of {user.StorageQuotaBytes} bytes.");
        }

        var photo = Photo.Create(ownerId, hash, fileName, contentType, storedLength, dateTime.UtcNow);
        photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);
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
        string? compressedPath = null;
        try
        {
            await using (var target = File.Create(tempPath))
            {
                await content.CopyToAsync(target, cancellationToken);
            }

            var user = await users.GetByIdAsync(ownerId, cancellationToken)
                ?? throw new NotFoundException($"User '{ownerId}' was not found.");

            EnsurePlanLimit(user.Plan, isVideo: true, new FileInfo(tempPath).Length);

            // Free-plan oversize videos are transcoded to the plan cap; the stored
            // bytes (and their dedup hash) are the transcoded result.
            if (user.Plan == "free" && UploadLimits.FreeMaxVideoBytes > 0
                && new FileInfo(tempPath).Length > UploadLimits.FreeMaxVideoBytes)
            {
                await using var source = File.OpenRead(tempPath);
                var transcoded = await videoCompressor.CompressToFitAsync(
                    source, UploadLimits.FreeMaxVideoBytes, cancellationToken);
                compressedPath = Path.Combine(Path.GetTempPath(), $"iphotos-upload-{Guid.NewGuid():N}.mp4");
                await using (var target = File.Create(compressedPath))
                {
                    await transcoded.CopyToAsync(target, cancellationToken);
                }
                await transcoded.DisposeAsync();
            }

            await using var videoFile = File.OpenRead(compressedPath ?? tempPath);
            var hash = contentHasher.ComputeHash(videoFile);

            var existing = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
            if (existing is not null)
            {
                return new PhotoUploadResult(ToDto(existing, []), Duplicated: true);
            }

            var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
            if (usage.UsedBytes + videoFile.Length > user.StorageQuotaBytes)
            {
                throw new QuotaExceededException(
                    $"Upload of {videoFile.Length} bytes would exceed the storage quota of {user.StorageQuotaBytes} bytes.");
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
            if (compressedPath is not null) File.Delete(compressedPath);
        }
    }

    public async Task<PhotoDto> GetAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.");

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

    public async Task DeleteAsync(Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.");

        var photoVariants = await variants.ListByPhotoAsync(photoId, cancellationToken);
        var blobsToDelete = photoVariants
            .Select(v => v.BlobPath)
            .Append(photo.OriginalBlobPath)
            .Distinct()
            .ToList();

        foreach (var blobPath in blobsToDelete)
        {
            await blobStorage.DeleteAsync(blobPath, cancellationToken);
        }

        await variants.DeleteByPhotoAsync(photoId, cancellationToken);
        await photos.DeleteAsync(photo, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<UsageSummary> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.");

        var stats = await photos.GetUsageAsync(ownerId, cancellationToken);
        return new UsageSummary(stats.UsedBytes, user.StorageQuotaBytes, stats.PhotoCount, stats.VariantCount);
    }

    public async Task<VariantFile> GetVariantFileAsync(
        Guid ownerId,
        Guid photoId,
        VariantKind kind,
        CancellationToken cancellationToken = default)
    {
        var photo = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.");

        if (kind == VariantKind.Original)
        {
            return new VariantFile(photo.OriginalBlobPath, photo.MimeType, photo.SizeBytes, photo.ContentHash);
        }

        var variant = (await variants.ListByPhotoAsync(photoId, cancellationToken))
            .FirstOrDefault(v => v.Kind == kind)
            ?? throw new NotFoundException($"{kind} variant for photo '{photoId}' is not ready yet.");

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
