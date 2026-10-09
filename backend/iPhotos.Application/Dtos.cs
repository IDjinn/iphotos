using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application;

public sealed record AuthTokens(string AccessToken, string RefreshToken, DateTimeOffset RefreshTokenExpiresAt);

public sealed record AuthResult(Guid UserId, string Email, string? DisplayName, AuthTokens Tokens);

public sealed record RegisterRequest(string Email, string Password, string? DisplayName);

public sealed record LoginRequest(string Email, string Password);

public sealed record VariantDto(VariantKind Kind, string BlobPath, int Width, int Height, long SizeBytes, string Format);

public sealed record PhotoDto(
    Guid Id,
    Guid OwnerId,
    string FileName,
    string MimeType,
    MediaType MediaType,
    long SizeBytes,
    int? Width,
    int? Height,
    double? DurationSeconds,
    DateTimeOffset? TakenAt,
    string? CameraMake,
    string? CameraModel,
    double? GpsLatitude,
    double? GpsLongitude,
    string? Title,
    string? Description,
    PhotoState State,
    string? LastError,
    string ContentHash,
    DateTimeOffset CreatedAt,
    IReadOnlyList<VariantDto> Variants)
{
    public static PhotoDto From(Photo photo, IReadOnlyList<VariantDto> variants) => new(
        photo.Id,
        photo.OwnerId,
        photo.FileName,
        photo.MimeType,
        photo.MediaType,
        photo.SizeBytes,
        photo.Width,
        photo.Height,
        photo.DurationSeconds,
        photo.TakenAt,
        photo.CameraMake,
        photo.CameraModel,
        photo.GpsLatitude,
        photo.GpsLongitude,
        photo.Title,
        photo.Description,
        photo.State,
        photo.LastError,
        photo.ContentHash,
        photo.CreatedAt,
        variants);
}

public sealed record PhotoUploadResult(PhotoDto Photo, bool Duplicated);

public sealed record UploadTicketRequest(string FileName, string ContentType, long SizeBytes, string ContentHash);

/// <summary>Direct-upload ticket: reserve dedup/quota, then PUT the bytes straight to storage.
/// <c>UploadUrl</c> is null for duplicates (nothing to upload). Oversize files get a multipart
/// session instead of a single presigned PUT (<c>MultipartUploadId</c> + <c>PartSizeBytes</c>).</summary>
public sealed record UploadTicket(
    PhotoDto Photo,
    bool Duplicated,
    string? UploadUrl,
    DateTimeOffset? ExpiresAt,
    string? MultipartUploadId = null,
    long? PartSizeBytes = null);

public sealed record PartUrlRequest(int PartNumber);

public sealed record CompleteUploadRequest(string? MultipartUploadId, IReadOnlyList<BlobPartETag>? Parts);

public sealed record PartUrlResponse(string Url, int PartNumber, DateTimeOffset ExpiresAt);

public sealed record PhotoFilter(
    Guid OwnerId,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? FileName = null,
    string? Camera = null,
    int Page = 1,
    int PageSize = 20,
    MediaType? MediaType = null,
    string? SortBy = null,
    string? Order = null);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

/// <summary>
/// One timeline month of the owner's library ("yyyy-MM" + photo count), for
/// fast-scroll rails. Photos without TakenAt come last under Month "".
/// </summary>
public sealed record PhotoMonthBucket(string Month, int Count);

public sealed record UsageStats(long UsedBytes, int PhotoCount, int VariantCount);

public sealed record UsageSummary(long UsedBytes, long QuotaBytes, int PhotoCount, int VariantCount);

public sealed record ZipImportJobDto(
    Guid Id,
    JobState State,
    string FileName,
    long SizeBytes,
    int TotalEntries,
    int ProcessedEntries,
    int Imported,
    int VideosImported,
    int Duplicated,
    int Ignored,
    int VideosIgnored,
    int Failed,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt)
{
    public static ZipImportJobDto From(ZipImportJob job) => new(
        job.Id,
        job.State,
        job.FileName,
        job.SizeBytes,
        job.TotalEntries,
        job.ProcessedEntries,
        job.Imported,
        job.VideosImported,
        job.Duplicated,
        job.Ignored,
        job.VideosIgnored,
        job.Failed,
        job.LastError,
        job.CreatedAt,
        job.ProcessedAt);
}

public sealed record BillingProductDto(string ProductId, string DisplayName, string DisplayPrice, long QuotaBytes);

public sealed record BillingProductsResponse(bool Sandbox, IReadOnlyList<BillingProductDto> Products);

public sealed record VerifyPurchaseRequest(string ProductId, string PurchaseToken);

public sealed record RestorePurchaseRequest(string PurchaseToken);

/// <summary>Computed (not persisted) subscription state for the API contract.</summary>
public enum BillingSubscriptionState
{
    /// <summary>No purchase associated with the account.</summary>
    Free,

    /// <summary>The subscription term is running.</summary>
    Active,

    /// <summary>The term ended but the grace period is still running.</summary>
    Grace,

    /// <summary>The grace period ended; uploads are gated by the free quota again.</summary>
    Expired,
}

public sealed record BillingStatusDto(
    string Plan,
    BillingSubscriptionState State,
    long QuotaBytes,
    DateTimeOffset? ExpiresAt);

/// <summary>Account-wide upload quality plus the effective per-file caps for the
/// current (plan, quality) mode and how many stored photos can be rewritten to match.</summary>
public sealed record UserPreferencesDto(
    string UploadQuality,
    int MismatchedPhotoCount,
    long ImageCapBytes,
    long VideoCapBytes);

public sealed record UpdateUserPreferencesRequest(string UploadQuality, bool ApplyToExisting = false);
