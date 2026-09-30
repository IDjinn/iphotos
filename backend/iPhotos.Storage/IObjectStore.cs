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
}
