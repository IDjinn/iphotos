namespace iPhotos.Application.Common;

/// <summary>
/// Opaque blob storage. Filesystem-backed today; S3-compatible storage later
/// (same seam as the mobile plans' StorageProvider, doc 02 §3).
/// Paths use '/' separators and are relative to the storage root.
/// </summary>
public interface IBlobStorage
{
    Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default);

    Task DeleteAsync(string path, CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default);

    /// <summary>
    /// A time-limited URL the client can PUT the bytes to directly (bypassing this API),
    /// or null when the backing storage cannot presign direct uploads.
    /// </summary>
    Task<BlobUploadUrl?> TryCreateUploadUrlAsync(string path, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default);
}

/// <summary>A direct-upload URL minted by the backing storage service.</summary>
public sealed record BlobUploadUrl(string Url, DateTimeOffset ExpiresAt);
