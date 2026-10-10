using iPhotos.Domain;

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

public sealed class UploadOptions
{
    public const string SectionName = "Upload";

    // ── Storage-saver modes: files over the cap are accepted and compressed/transcoded
    //    to fit by the variant worker (videos also downscaled to SaverVideoMaxHeight). ──

    /// <summary>Free plan + storage saver: max image size in bytes.</summary>
    public long FreeSaverMaxImageBytes { get; set; } = 16L * 1024 * 1024; // 16 MB

    /// <summary>Free plan + storage saver: max video size in bytes.</summary>
    public long FreeSaverMaxVideoBytes { get; set; } = 1L * 1024 * 1024 * 1024; // 1 GiB

    /// <summary>Paid plan + storage saver: max image size in bytes.</summary>
    public long PaidSaverMaxImageBytes { get; set; } = 250L * 1024 * 1024; // 250 MB

    /// <summary>Paid plan + storage saver: max video size in bytes.</summary>
    public long PaidSaverMaxVideoBytes { get; set; } = 10L * 1024 * 1024 * 1024; // 10 GiB

    // ── Original-quality modes: files over the cap are rejected outright. ──

    /// <summary>Free plan + original quality: max image size in bytes; larger uploads are rejected. 0 disables the cap.</summary>
    public long FreeOriginalMaxImageBytes { get; set; } = 64L * 1024 * 1024; // 64 MB

    /// <summary>Free plan + original quality: max video size in bytes; larger uploads are rejected. 0 disables the cap.</summary>
    public long FreeOriginalMaxVideoBytes { get; set; } = 1L * 1024 * 1024 * 1024; // 1 GiB

    /// <summary>Paid plan + original quality: max image size in bytes; larger uploads are rejected. 0 disables the cap.</summary>
    public long PaidOriginalMaxImageBytes { get; set; } = 500L * 1024 * 1024; // 500 MB

    /// <summary>Paid plan + original quality: max video size in bytes; larger uploads are rejected. 0 disables the cap.</summary>
    public long PaidOriginalMaxVideoBytes { get; set; } = 30L * 1024 * 1024 * 1024; // 30 GiB

    /// <summary>Height ceiling applied when transcoding videos in storage-saver modes
    /// (0 keeps the source resolution).</summary>
    public int SaverVideoMaxHeight { get; set; } = 1080;

    /// <summary>Direct uploads at or above this size use presigned multipart instead of a
    /// single presigned PUT (S3 caps one PUT at 5 GB). Keep below the smallest paid video cap.</summary>
    public long DirectMultipartThresholdBytes { get; set; } = 5L * 1024 * 1024 * 1024; // 5 GiB

    /// <summary>Upload throughput assumed when sizing presigned PUT expiries for large files.</summary>
    public double AssumedUploadMbps { get; set; } = 20;

    /// <summary>Upper bound for any presigned PUT expiry, however large the file.</summary>
    public int UploadUrlMaxExpiryHours { get; set; } = 24;

    /// <summary>Billing stores the product id on Plan, so any non-free value is a paid tier.</summary>
    public static bool IsFreePlan(string plan) => plan == "free";

    /// <summary>Effective (image, video) per-file caps for a (plan, upload quality) mode.
    /// In saver modes the caps only trigger compression — oversize files are accepted.</summary>
    public (long ImageBytes, long VideoBytes) CapsFor(string plan, string uploadQuality)
    {
        var free = IsFreePlan(plan);
        return uploadQuality == UploadQualities.Original
            ? (free ? FreeOriginalMaxImageBytes : PaidOriginalMaxImageBytes,
               free ? FreeOriginalMaxVideoBytes : PaidOriginalMaxVideoBytes)
            : (free ? FreeSaverMaxImageBytes : PaidSaverMaxImageBytes,
               free ? FreeSaverMaxVideoBytes : PaidSaverMaxVideoBytes);
    }
}

public sealed class VideoProcessorOptions
{
    public const string SectionName = "VideoProcessor";

    /// <summary>ffmpeg binary used for poster-frame extraction; resolved from PATH unless overridden.</summary>
    public string FfmpegPath { get; set; } = "ffmpeg";

    /// <summary>ffprobe binary used for container/stream probing; resolved from PATH unless overridden.</summary>
    public string FfprobePath { get; set; } = "ffprobe";
}

public sealed class ZipImportOptions
{
    public const string SectionName = "ZipImport";

    /// <summary>Maximum accepted ZIP payload size (single archives up to 100 GiB are accepted;
    /// splitting a Takeout into parts remains recommended for very large libraries).</summary>
    public long MaxZipBytes { get; set; } = 100L * 1024 * 1024 * 1024; // 100 GiB

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

/// <summary>Master switch for the AI pipelines (doc 18): false prevents any
/// ml_jobs from being enqueued; jobs already queued still run.</summary>
public sealed class AiOptions
{
    public const string SectionName = "Ai";

    public bool Enabled { get; set; }

    /// <summary>
    /// Backfill of photos that became Ready before the pipeline existed. Off by
    /// default on purpose: every backfilled photo re-downloads its preview from
    /// blob storage (S3 GETs). Turn on to index the existing library.
    /// </summary>
    public bool BackfillEnabled { get; set; }
}

/// <summary>Face inference service connection + clustering thresholds (doc 18 §6.3).</summary>
public sealed class MlOptions
{
    public const string SectionName = "Ml";

    public string BaseUrl { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public int TimeoutSeconds { get; set; } = 60;

    /// <summary>Detections below this confidence are discarded.</summary>
    public float MinDetScore { get; set; } = 0.5f;

    /// <summary>Minimum face bbox width in preview pixels (junk/rejects tiny backs-of-heads).</summary>
    public float MinFaceSizePx { get; set; } = 40;

    /// <summary>Cosine similarity to a person centroid for incremental assignment.</summary>
    public float MatchThreshold { get; set; } = 0.55f;

    /// <summary>Cosine similarity edge weight for full reclustering (Chinese Whispers).</summary>
    public float ClusterThreshold { get; set; } = 0.55f;

    /// <summary>Minimum faces for a new auto-created person; singletons stay unassigned.</summary>
    public int MinClusterFaces { get; set; } = 2;
}

/// <summary>
/// Scene-label vision endpoint (doc 18 §8, D21): any OpenAI-compatible
/// chat/completions server — Ollama, LM Studio, OpenAI, Gemini-compatible, etc.
/// Unset BaseUrl disables the labeling pipeline.
/// </summary>
public sealed class VisionOptions
{
    public const string SectionName = "Vision";

    public string BaseUrl { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = string.Empty;

    /// <summary>System prompt; {maxLabels} is interpolated. Override to steer the tag set.</summary>
    public string Prompt { get; set; } =
        "You label photos for a photo library. Look at the image and return the most relevant scene tags. "
        + "Rules: lowercase English, singular nouns, 1-3 words each, no duplicates, no people names, "
        + "no subjective adjectives. Return at most {maxLabels} tags with a confidence score between 0 and 1. "
        + "Reply with JSON only: {\"labels\":[{\"name\":\"...\",\"score\":0.0}]}";

    public int MaxLabels { get; set; } = 8;

    /// <summary>Labels below this confidence are discarded.</summary>
    public float MinScore { get; set; } = 0.4f;

    public int TimeoutSeconds { get; set; } = 90;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(Model);
}
