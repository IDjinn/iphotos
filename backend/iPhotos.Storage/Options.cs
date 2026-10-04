namespace iPhotos.Storage;

public sealed class StorageServiceOptions
{
    public const string SectionName = "Storage";

    public string DefaultProvider { get; set; } = "filesystem";

    /// <summary>Shared secret required by every non-signed request (X-Api-Key header).</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>HMAC key for signed GET URLs on providers that cannot presign.</summary>
    public string SigningKey { get; set; } = string.Empty;

    /// <summary>Public base URL baked into returned object URLs; falls back to the request's own host.</summary>
    public string? PublicBaseUrl { get; set; }

    /// <summary>Expiry for URLs returned on upload and by the url endpoint.</summary>
    public TimeSpan UrlExpiry { get; set; } = TimeSpan.FromDays(7);

    /// <summary>Expiry for presigned PUT URLs handed to clients for direct uploads.</summary>
    public TimeSpan UploadUrlExpiry { get; set; } = TimeSpan.FromMinutes(15);

    /// <summary>Allow loopback/private provider endpoints (on-prem MinIO, compose, tests).</summary>
    public bool AllowPrivateNetworks { get; set; }

    /// <summary>302-redirect GETs to presigned URLs instead of proxying (S3-family only).</summary>
    public bool RedirectToPresigned { get; set; }

    /// <summary>Must cover zip-import staging: the API streams the whole archive through
    /// a single PUT, so this needs headroom above ZipImport:MaxZipBytes (100 GiB).</summary>
    public long MaxBodyBytes { get; set; } = 110L * 1024 * 1024 * 1024;
}

public sealed class FileSystemProviderOptions
{
    public const string SectionName = "Providers:FileSystem";

    public string RootPath { get; set; } = Path.Combine("data", "objects");
}

public sealed class S3ProviderOptions
{
    public const string SectionName = "Providers:S3";

    /// <summary>Custom S3 endpoint (Wasabi, MinIO, Backblaze B2, Cloudflare R2...). Empty = AWS proper.</summary>
    public string Endpoint { get; set; } = string.Empty;

    public string Region { get; set; } = "us-east-1";

    public string Bucket { get; set; } = string.Empty;

    public string AccessKey { get; set; } = string.Empty;

    public string SecretKey { get; set; } = string.Empty;

    /// <summary>Required by Wasabi/MinIO/B2/R2-style endpoints (bucket in the path, not the host).</summary>
    public bool ForcePathStyle { get; set; } = true;

    /// <summary>Optional key prefix inside the bucket (all app objects live below it).</summary>
    public string Prefix { get; set; } = string.Empty;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Bucket)
        && !string.IsNullOrWhiteSpace(AccessKey)
        && !string.IsNullOrWhiteSpace(SecretKey);
}

public sealed class WebDavProviderOptions
{
    public const string SectionName = "Providers:WebDav";

    public string BaseUrl { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    /// <summary>Optional sub-path below BaseUrl (e.g. "remote.php/dav/files/user/iphotos").</summary>
    public string RootPath { get; set; } = string.Empty;

    public int TimeoutSeconds { get; set; } = 100;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl);
}

public sealed class GoogleDriveProviderOptions
{
    public const string SectionName = "Providers:GoogleDrive";

    /// <summary>Path to the service-account JSON key file.</summary>
    public string ServiceAccountJsonPath { get; set; } = string.Empty;

    /// <summary>Inline service-account JSON (compose/env friendly). Takes precedence over the path.</summary>
    public string ServiceAccountJson { get; set; } = string.Empty;

    /// <summary>Destination folder id. Use a folder inside a Shared Drive: a service account
    /// has no personal storage quota of its own.</summary>
    public string RootFolderId { get; set; } = string.Empty;

    public string ApplicationName { get; set; } = "iphotos-storage";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ServiceAccountJson) || !string.IsNullOrWhiteSpace(ServiceAccountJsonPath);
}
