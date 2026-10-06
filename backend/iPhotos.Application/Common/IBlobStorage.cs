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

    /// <summary>Starts a direct multipart session; null when the backing storage cannot
    /// presign multipart uploads (clients fall back to the single-shot PUT).</summary>
    Task<string?> TryCreateMultipartUploadAsync(string path, string? contentType, CancellationToken cancellationToken = default)
        => Task.FromResult<string?>(null);

    /// <summary>A presigned PUT URL for one part (1-based) of an open multipart session;
    /// null when the backing storage cannot presign multipart uploads.</summary>
    Task<BlobUploadUrl?> TryCreatePartUrlAsync(string path, string uploadId, int partNumber, TimeSpan expiry, CancellationToken cancellationToken = default)
        => Task.FromResult<BlobUploadUrl?>(null);

    /// <summary>Seals an open multipart session from its uploaded parts.</summary>
    Task CompleteMultipartUploadAsync(string path, string uploadId, IReadOnlyList<BlobPartETag> parts, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Multipart uploads are not supported by the configured blob storage.");

    /// <summary>Cancels an open multipart session, discarding its uploaded parts.</summary>
    Task AbortMultipartUploadAsync(string path, string uploadId, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Multipart uploads are not supported by the configured blob storage.");
}

/// <summary>A direct-upload URL minted by the backing storage service.</summary>
public sealed record BlobUploadUrl(string Url, DateTimeOffset ExpiresAt);

/// <summary>A part confirmation reported by the client when completing a multipart upload.</summary>
public sealed record BlobPartETag(int PartNumber, string ETag);
