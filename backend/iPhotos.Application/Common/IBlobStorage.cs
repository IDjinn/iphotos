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
}
