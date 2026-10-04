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

    /// <summary>Maximum accepted ZIP payload size (single archives up to 10 GiB are accepted;
    /// smaller Takeout parts of 2-4 GiB remain the recommended export size).</summary>
    public long MaxZipBytes { get; set; } = 10L * 1024 * 1024 * 1024; // 10 GiB

    /// <summary>Fail fast when a ZIP declares more entries than this (Takeout zips carry JSON sidecars).</summary>
    public int MaxEntries { get; set; } = 50_000;

    /// <summary>Directory for extracted entries. Empty means the OS temp directory.</summary>
    public string WorkDir { get; set; } = string.Empty;
}

public sealed class BillingProductOptions
{
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Presentation-only price label; real prices live in the store, not in the backend.</summary>
    public string DisplayPrice { get; set; } = string.Empty;

    public long QuotaBytes { get; set; }
}

public sealed class BillingOptions
{
    public const string SectionName = "Billing";

    /// <summary>Which IBillingProvider implementation verifies purchases ("test" for now; "google_play"/"stripe" later).</summary>
    public string Provider { get; set; } = "test";

    /// <summary>True when purchases are simulated (no real money) — the app may surface a sandbox flow.</summary>
    public bool Sandbox { get; set; }

    /// <summary>Days past ExpiresAt before a subscription is treated as lapsed.</summary>
    public int GracePeriodDays { get; set; } = 3;

    /// <summary>How often the expiry sweep runs (hours).</summary>
    public int SweepIntervalHours { get; set; } = 24;

    /// <summary>Product catalog: store product id (SKU) → granted tier. Extra tiers drop in without migrations.</summary>
    public Dictionary<string, BillingProductOptions> Products { get; set; } = new(StringComparer.Ordinal);

    public BillingProductOptions? FindProduct(string productId) =>
        Products.TryGetValue(productId, out var product) ? product : null;
}

public sealed class CorsSettings
{
    public const string SectionName = "Cors";

    /// <summary>Origins allowed to call the API from a browser (web app, Electron shell).
    /// Empty disables cross-origin access entirely; native clients are unaffected by CORS.</summary>
    public string[] AllowedOrigins { get; set; } = [];

    public const string PolicyName = "web";
}

public sealed class TestBillingOptions
{
    public const string SectionName = "Billing:Test";

    /// <summary>Only tokens starting with this prefix are considered valid.</summary>
    public string TokenPrefix { get; set; } = "test_";

    /// <summary>Subscription length granted for a valid test token.</summary>
    public int DurationDays { get; set; } = 30;
}
