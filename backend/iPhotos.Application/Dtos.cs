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
    long SizeBytes,
    int? Width,
    int? Height,
    DateTimeOffset? TakenAt,
    string? CameraMake,
    string? CameraModel,
    double? GpsLatitude,
    double? GpsLongitude,
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
        photo.SizeBytes,
        photo.Width,
        photo.Height,
        photo.TakenAt,
        photo.CameraMake,
        photo.CameraModel,
        photo.GpsLatitude,
        photo.GpsLongitude,
        photo.State,
        photo.LastError,
        photo.ContentHash,
        photo.CreatedAt,
        variants);
}

public sealed record PhotoUploadResult(PhotoDto Photo, bool Duplicated);

public sealed record PhotoFilter(
    Guid OwnerId,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? FileName = null,
    string? Camera = null,
    int Page = 1,
    int PageSize = 20);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public sealed record UsageStats(long UsedBytes, int PhotoCount, int VariantCount);

public sealed record UsageSummary(long UsedBytes, long QuotaBytes, int PhotoCount, int VariantCount);
