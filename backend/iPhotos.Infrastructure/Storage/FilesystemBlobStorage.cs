using iPhotos.Application;
using iPhotos.Application.Common;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.Storage;

/// <summary>
/// Filesystem-backed blob storage under a configurable root. Paths use '/' separators
/// relative to the root; path traversal is rejected.
/// </summary>
public sealed class FilesystemBlobStorage : IBlobStorage
{
    private readonly string _root;

    public FilesystemBlobStorage(IOptions<BlobStorageOptions> options)
        : this(options.Value.RootPath)
    {
    }

    public FilesystemBlobStorage(string rootPath)
    {
        _root = Path.GetFullPath(rootPath);
        Directory.CreateDirectory(_root);
    }

    public async Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default)
    {
        var full = SafeFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        await using var file = File.Create(full);
        await content.CopyToAsync(file, cancellationToken);
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
    {
        var full = SafeFullPath(path);
        if (!File.Exists(full))
        {
            throw new FileNotFoundException($"Blob '{path}' not found.", full);
        }

        return Task.FromResult<Stream>(File.OpenRead(full));
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        var full = SafeFullPath(path);
        if (File.Exists(full))
        {
            File.Delete(full);
        }

        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default) =>
        Task.FromResult(File.Exists(SafeFullPath(path)));

    public Task<BlobUploadUrl?> TryCreateUploadUrlAsync(string path, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default) =>
        // Local files have no client-reachable URL; direct upload is S3-only.
        Task.FromResult<BlobUploadUrl?>(null);

    private string SafeFullPath(string path)
    {
        var normalized = path.Replace('\\', '/');
        if (string.IsNullOrWhiteSpace(normalized)
            || normalized.Contains("..", StringComparison.Ordinal)
            || normalized.StartsWith('/'))
        {
            throw new ArgumentException($"Invalid blob path '{path}'.", nameof(path));
        }

        var full = Path.GetFullPath(Path.Combine(_root, normalized));
        if (!full.StartsWith(_root, StringComparison.Ordinal))
        {
            throw new ArgumentException($"Blob path '{path}' escapes the storage root.", nameof(path));
        }

        return full;
    }
}
