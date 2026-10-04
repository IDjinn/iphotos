namespace iPhotos.Application;

/// <summary>Connection to the standalone storage service (iPhotos.Storage.Host).</summary>
public sealed class HttpBlobStorageOptions
{
    public const string SectionName = "StorageService";

    public string BaseUrl { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Provider id to address on every request; empty = the service default.</summary>
    public string Provider { get; set; } = string.Empty;

    /// <summary>Timeout for quick metadata operations (head/delete/presign) against the
    /// storage service. Payload transfers (PUT/GET) have no total timeout; they are
    /// bounded by the caller's CancellationToken instead.</summary>
    public int TimeoutSeconds { get; set; } = 100;

    /// <summary>Allow loopback/private storage-service endpoints (compose, on-prem).</summary>
    public bool AllowPrivateNetworks { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl);
}

public sealed class BlobStorageOptions
{
    public const string SectionName = "BlobStorage";

    /// <summary>'Filesystem' (default, local data dir) or 'Http' (remote storage service).</summary>
    public string Mode { get; set; } = "Filesystem";

    public string RootPath { get; set; } = Path.Combine("data", "blobs");
}
