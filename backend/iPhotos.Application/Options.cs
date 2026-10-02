namespace iPhotos.Application;

public sealed class JwtOptions
{
    public const string SectionName = "Auth:Jwt";

    /// <summary>HS256 signing key, at least 32 characters (256 bits).</summary>
    public string SigningKey { get; set; } = string.Empty;

    public string Issuer { get; set; } = "iphotos";

    public string Audience { get; set; } = "iphotos-client";

    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(15);

    public TimeSpan RefreshTokenLifetime { get; set; } = TimeSpan.FromDays(30);
}

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>Default per-user storage quota for the free plan.</summary>
    public long DefaultQuotaBytes { get; set; } = 15L * 1024 * 1024 * 1024; // 15 GiB
}

public sealed class ImagingOptions
{
    public const string SectionName = "Imaging";

    public int ThumbnailLongEdge { get; set; } = 320;

    public int ThumbnailQuality { get; set; } = 75;

    public int PreviewLongEdge { get; set; } = 2048;

    public int PreviewQuality { get; set; } = 80;
}

public sealed class ZipImportOptions
{
    public const string SectionName = "ZipImport";

    /// <summary>Maximum accepted ZIP payload size (Google Takeout archives default to 2 GB parts).</summary>
    public long MaxZipBytes { get; set; } = 5L * 1024 * 1024 * 1024; // 5 GiB

    /// <summary>Fail fast when a ZIP declares more entries than this (Takeout zips carry JSON sidecars).</summary>
    public int MaxEntries { get; set; } = 50_000;

    /// <summary>Directory for extracted entries. Empty means the OS temp directory.</summary>
    public string WorkDir { get; set; } = string.Empty;
}
