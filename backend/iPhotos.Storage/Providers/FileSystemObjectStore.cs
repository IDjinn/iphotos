namespace iPhotos.Storage.Providers;

/// <summary>Objects as files under a configurable root; keys map 1:1 to relative paths.</summary>
public sealed class FileSystemObjectStore : IObjectStore
{
    // The filesystem does not store a content type; infer from the key extension so
    // proxied GETs carry the original media type.
    private static readonly Dictionary<string, string> ContentTypesByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".gif"] = "image/gif",
        [".avif"] = "image/avif",
        [".heic"] = "image/heic",
        [".json"] = "application/json",
        [".mp4"] = "video/mp4",
        [".mov"] = "video/quicktime",
    };

    private readonly string _root;

    public FileSystemObjectStore(FileSystemProviderOptions options)
    {
        _root = Path.GetFullPath(options.RootPath);
        Directory.CreateDirectory(_root);
    }

    public string Id => "filesystem";

    public bool CanPresign => false;

    public async Task<ObjectWriteResult> PutAsync(string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        var normalized = ObjectKey.Normalize(key);
        var full = FullPath(normalized);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        await using var file = File.Create(full);
        var counting = new CountingStream(file);
        await content.CopyToAsync(counting, cancellationToken);
        return new ObjectWriteResult(counting.BytesWritten, ETag: null);
    }

    public Task<ObjectReadResult> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        var full = FullPath(ObjectKey.Normalize(key));
        var info = new FileInfo(full);
        if (!info.Exists)
        {
            throw new ObjectNotFoundException(Id, key);
        }

        Stream content = info.OpenRead();
        var contentType = ContentTypesByExtension.TryGetValue(info.Extension, out var mapped) ? mapped : null;
        return Task.FromResult(new ObjectReadResult(content, contentType, info.Length, ETag: null));
    }

    public Task<ObjectHeadInfo> HeadAsync(string key, CancellationToken cancellationToken = default)
    {
        var info = new FileInfo(FullPath(ObjectKey.Normalize(key)));
        if (!info.Exists)
        {
            throw new ObjectNotFoundException(Id, key);
        }

        return Task.FromResult(new ObjectHeadInfo(info.Length, ETag: null));
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var full = FullPath(ObjectKey.Normalize(key));
        if (File.Exists(full))
        {
            File.Delete(full);
        }

        return Task.CompletedTask;
    }

    public Task<string?> TryPresignGetAsync(string key, TimeSpan expiry, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    private string FullPath(string normalizedKey)
    {
        var full = Path.GetFullPath(Path.Combine(_root, normalizedKey));
        if (!full.StartsWith(_root, StringComparison.Ordinal))
        {
            throw new InvalidObjectKeyException($"Object key '{normalizedKey}' escapes the storage root.");
        }

        return full;
    }
}
