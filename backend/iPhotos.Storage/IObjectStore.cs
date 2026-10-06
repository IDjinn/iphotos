namespace iPhotos.Storage;

public sealed record ObjectWriteResult(long SizeBytes, string? ETag);

public sealed record ObjectReadResult(Stream Content, string? ContentType, long? SizeBytes, string? ETag);

public sealed record ObjectHeadInfo(long? SizeBytes, string? ETag);

/// <summary>The requested object does not exist for this provider.</summary>
public sealed class ObjectNotFoundException(string providerId, string key)
    : Exception($"Object '{key}' not found ({providerId}).");

/// <summary>
/// A provider operation failed for infrastructure reasons. Messages are composed by the
/// provider itself and are safe to expose to the API caller (no secrets, no URLs of
/// configured backends).
/// </summary>
public sealed class ProviderException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// A single object-store backend. Keys are opaque, caller-chosen paths (see <see cref="ObjectKey"/>);
/// each provider maps them onto its own physical layout. Payload bytes are treated as opaque.
/// </summary>
public interface IObjectStore
{
    /// <summary>Stable provider id ('filesystem' | 's3' | 'webdav' | 'googledrive').</summary>
    string Id { get; }

    /// <summary>True when the provider can mint time-limited GET URLs by itself.</summary>
    bool CanPresign { get; }

    Task<ObjectWriteResult> PutAsync(string key, Stream content, string? contentType, CancellationToken cancellationToken = default);

    /// <summary>Opens the object for reading; throws <see cref="ObjectNotFoundException"/> when missing.</summary>
    Task<ObjectReadResult> OpenReadAsync(string key, CancellationToken cancellationToken = default);

    Task<ObjectHeadInfo> HeadAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Deletes the object; deleting a missing object is not an error.</summary>
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>A presigned GET URL when <see cref="CanPresign"/>, otherwise null.</summary>
    Task<string?> TryPresignGetAsync(string key, TimeSpan expiry, CancellationToken cancellationToken = default);

    /// <summary>
    /// A presigned PUT URL for direct client uploads when <see cref="CanPresign"/>, otherwise null.
    /// When <paramref name="contentType"/> is non-null the client must send the same Content-Type.
    /// </summary>
    Task<string?> TryPresignPutAsync(string key, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default);

    /// <summary>Starts a direct-upload multipart session; null when the provider cannot
    /// presign multipart uploads (clients then fall back to the single-shot PUT).</summary>
    Task<string?> TryCreateMultipartUploadAsync(string key, string? contentType, CancellationToken cancellationToken = default) => null;

    /// <summary>A presigned PUT URL for one part (1-based <paramref name="partNumber"/>) of an
    /// open multipart session; null when the provider cannot presign multipart uploads.</summary>
    Task<string?> TryPresignPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken cancellationToken = default) => null;

    /// <summary>Seals an open multipart session from its uploaded parts.
    /// Throws <see cref="NotSupportedException"/> when the provider cannot presign.</summary>
    Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<MultipartPartETag> parts, CancellationToken cancellationToken = default)
        => throw new NotSupportedException($"Provider '{Id}' cannot complete multipart uploads.");

    /// <summary>Cancels an open multipart session, discarding its uploaded parts.
    /// Throws <see cref="NotSupportedException"/> when the provider cannot presign.</summary>
    Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken cancellationToken = default)
        => throw new NotSupportedException($"Provider '{Id}' cannot abort multipart uploads.");
}

/// <summary>A part confirmation returned by the client when completing a multipart upload.</summary>
public sealed record MultipartPartETag(int PartNumber, string ETag);
