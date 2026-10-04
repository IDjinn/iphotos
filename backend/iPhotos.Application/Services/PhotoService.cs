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

public sealed record VariantFile(string BlobPath, string ContentType, long SizeBytes, string ContentHash);

public sealed class PhotoService(
    IPhotoRepository photos,
    IVariantRepository variants,
    IVariantJobRepository jobs,
    IUserRepository users,
    IBlobStorage blobStorage,
    IContentHasher contentHasher,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime)
{
    /// <summary>Lifetime of presigned PUT URLs handed out by upload tickets.</summary>
    private static readonly TimeSpan UploadUrlLifetime = TimeSpan.FromMinutes(15);

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

        if (!SupportedImageTypes.MimeTypes.Contains(contentType))
        {
            throw new ValidationException(
                $"Unsupported content type '{contentType}'. Supported: image/jpeg, image/png, image/webp.");
        }

        if (sizeBytes <= 0)
        {
            throw new ValidationException("File size must be greater than zero.");
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

        var photo = Photo.CreatePendingUpload(ownerId, contentHash, fileName, contentType, sizeBytes, dateTime.UtcNow);
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
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ValidationException("File name is required.");
        }

        if (!SupportedImageTypes.MimeTypes.Contains(contentType))
        {
            throw new ValidationException(
                $"Unsupported content type '{contentType}'. Supported: image/jpeg, image/png, image/webp.");
        }

        var content2 = EnsureSeekable(content);
        var hash = contentHasher.ComputeHash(content2);

        var existing = await photos.FindByContentHashAsync(ownerId, hash, cancellationToken);
        if (existing is not null)
        {
            return new PhotoUploadResult(ToDto(existing, []), Duplicated: true);
        }

        var user = await users.GetByIdAsync(ownerId, cancellationToken)
            ?? throw new NotFoundException($"User '{ownerId}' was not found.");

        var usage = await photos.GetUsageAsync(ownerId, cancellationToken);
        if (usage.UsedBytes + content2.Length > user.StorageQuotaBytes)
        {
            throw new QuotaExceededException(
                $"Upload of {content2.Length} bytes would exceed the storage quota of {user.StorageQuotaBytes} bytes.");
        }

        var photo = Photo.Create(ownerId, hash, fileName, contentType, content2.Length, dateTime.UtcNow);
        photo.OriginalBlobPath = BlobPaths.Original(ownerId, photo.Id, fileName);

        await blobStorage.PutAsync(photo.OriginalBlobPath, content2, cancellationToken);
        await photos.AddAsync(photo, cancellationToken);
        await jobs.EnqueueAsync(photo.Id, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new PhotoUploadResult(ToDto(photo, []), Duplicated: false);
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
        _ => "application/octet-stream",
    };

    private static PhotoDto ToDto(Photo photo, IReadOnlyList<VariantDto> photoVariants) =>
        PhotoDto.From(photo, photoVariants);

    private static VariantDto ToVariantDto(PhotoVariant variant) =>
        new(variant.Kind, variant.BlobPath, variant.Width, variant.Height, variant.SizeBytes, variant.Format);
}
