using iPhotos.Storage.Providers;

namespace iPhotos.Storage;

/// <summary>No provider with this id is configured.</summary>
public sealed class ProviderNotConfiguredException(string providerId)
    : Exception($"Storage provider '{providerId}' is not configured.");

/// <summary>
/// Lazy, cached resolution of configured providers. The default comes from
/// <see cref="StorageServiceOptions.DefaultProvider"/>; a caller may address a specific
/// provider per request via the 'provider' query parameter.
/// </summary>
public sealed class ObjectStoreFactory
{
    public static readonly IReadOnlyList<string> KnownProviderIds = ["filesystem", "s3", "webdav", "googledrive"];

    private readonly StorageServiceOptions _options;
    private readonly Func<string, IObjectStore?> _resolver;
    private readonly Dictionary<string, IObjectStore> _cache = new();

    public ObjectStoreFactory(StorageServiceOptions options, Func<string, IObjectStore?> resolver)
    {
        _options = options;
        _resolver = resolver;
    }

    public IObjectStore GetDefault() => Resolve(_options.DefaultProvider);

    public IObjectStore Resolve(string? providerId)
    {
        var id = string.IsNullOrWhiteSpace(providerId) ? _options.DefaultProvider : providerId.Trim().ToLowerInvariant();
        lock (_cache)
        {
            if (_cache.TryGetValue(id, out var cached))
            {
                return cached;
            }
        }

        var store = _resolver(id) ?? throw new ProviderNotConfiguredException(id);

        lock (_cache)
        {
            _cache[id] = store;
            return store;
        }
    }

    /// <summary>Builds the resolver used above from configuration; unconfigured providers return null.</summary>
    public static ObjectStoreFactory FromOptions(
        StorageServiceOptions storage,
        FileSystemProviderOptions? fileSystem,
        S3ProviderOptions? s3,
        WebDavProviderOptions? webDav,
        GoogleDriveProviderOptions? googleDrive)
    {
        return new ObjectStoreFactory(storage, providerId => providerId switch
        {
            "filesystem" => fileSystem is null ? null : new FileSystemObjectStore(fileSystem),
            "s3" => s3 is { IsConfigured: true } ? new S3ObjectStore(s3, storage.AllowPrivateNetworks) : null,
            "webdav" => webDav is { IsConfigured: true } ? new WebDavObjectStore(webDav, storage.AllowPrivateNetworks) : null,
            "googledrive" => googleDrive is { IsConfigured: true } ? new GoogleDriveObjectStore(googleDrive) : null,
            _ => null,
        });
    }
}
