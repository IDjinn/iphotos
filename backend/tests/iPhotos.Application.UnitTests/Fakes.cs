using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using System.Text;

namespace iPhotos.Application.UnitTests;

public sealed class StubDateTimeProvider(DateTimeOffset now) : IDateTimeProvider
{
    public DateTimeOffset UtcNow => now;
}

public sealed class FakePasswordHasher : IPasswordHasher
{
    public string Hash(string password) => "fake$" + password;

    public bool Verify(string password, string hash) => hash == "fake$" + password;
}

public sealed class FakeTokenService : ITokenService
{
    private int _counter;

    public DateTimeOffset RefreshExpiry { get; set; } = new(2026, 1, 31, 0, 0, 0, TimeSpan.Zero);

    public string IssueAccessToken(Guid userId, string email) => $"access:{userId}";

    public Task<Guid> ValidateAccessTokenAsync(string accessToken, CancellationToken cancellationToken = default)
        => Task.FromResult(Guid.Parse(accessToken["access:".Length..]));

    public RefreshTokenIssue GenerateRefreshToken()
    {
        var plain = $"refresh-{++_counter}";
        return new RefreshTokenIssue(plain, HashRefreshToken(plain), RefreshExpiry);
    }

    public string HashRefreshToken(string plainToken) => $"hash-{plainToken}";
}

public sealed class InMemoryUserRepository : IUserRepository
{
    public List<User> Users { get; } = [];

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
        => Task.FromResult(Users.FirstOrDefault(u => u.Email == email));

    public Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Users.FirstOrDefault(u => u.Id == id));

    public Task<User> AddAsync(User user, CancellationToken cancellationToken = default)
    {
        Users.Add(user);
        return Task.FromResult(user);
    }
}

public sealed class InMemoryRefreshTokenRepository : IRefreshTokenRepository
{
    public List<RefreshToken> Tokens { get; } = [];

    public Task AddAsync(RefreshToken token, CancellationToken cancellationToken = default)
    {
        Tokens.Add(token);
        return Task.CompletedTask;
    }

    public Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
        => Task.FromResult(Tokens.FirstOrDefault(t => t.TokenHash == tokenHash));
}

public sealed class InMemoryPhotoRepository : IPhotoRepository
{
    public List<Photo> Photos { get; } = [];

    public Task<Photo> AddAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        Photos.Add(photo);
        return Task.FromResult(photo);
    }

    public Task<Photo?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.Id == id));

    public Task<Photo?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.Id == id && p.OwnerId == ownerId));

    public Task<Photo?> FindByContentHashAsync(Guid ownerId, string contentHash, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.OwnerId == ownerId && p.ContentHash == contentHash));

    public Task<PagedResult<Photo>> ListAsync(PhotoFilter filter, CancellationToken cancellationToken = default)
    {
        IEnumerable<Photo> query = Photos.Where(p => p.OwnerId == filter.OwnerId);

        if (filter.From is not null)
        {
            query = query.Where(p => p.TakenAt >= filter.From);
        }

        if (filter.To is not null)
        {
            query = query.Where(p => p.TakenAt <= filter.To);
        }

        if (!string.IsNullOrWhiteSpace(filter.FileName))
        {
            query = query.Where(p => p.FileName.Contains(filter.FileName, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(filter.Camera))
        {
            query = query.Where(p =>
                (p.CameraMake ?? string.Empty).Contains(filter.Camera, StringComparison.OrdinalIgnoreCase)
                || (p.CameraModel ?? string.Empty).Contains(filter.Camera, StringComparison.OrdinalIgnoreCase));
        }

        var ordered = query
            .OrderByDescending(p => p.TakenAt ?? DateTimeOffset.MinValue)
            .ThenByDescending(p => p.CreatedAt)
            .ToList();
        var total = ordered.Count;
        var items = ordered
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToList();

        return Task.FromResult(new PagedResult<Photo>(items, filter.Page, filter.PageSize, total));
    }

    public Task DeleteAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        Photos.Remove(photo);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Photo>> ListStalePendingUploadsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<Photo>>(
            Photos.Where(p => p.State == PhotoState.PendingUpload && p.CreatedAt <= cutoff).ToList());

    public Task<UsageStats> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var owned = Photos.Where(p => p.OwnerId == ownerId).ToList();
        return Task.FromResult(new UsageStats(
            owned.Sum(p => p.SizeBytes), owned.Count, 0, owned.Count(p => p.IsLive)));
    }

    public Task<IReadOnlyList<Guid>> ListQualityMismatchIdsAsync(
        Guid ownerId,
        string uploadQuality,
        long imageCapBytes,
        long videoCapBytes,
        CancellationToken cancellationToken = default)
    {
        if (uploadQuality != UploadQualities.StorageSaver)
        {
            return Task.FromResult<IReadOnlyList<Guid>>([]);
        }

        var mismatches = Photos
            .Where(p => p.OwnerId == ownerId
                && p.State == PhotoState.Ready
                && p.StoredQuality == UploadQualities.Original
                && ((p.MediaType == MediaType.Photo && p.SizeBytes > imageCapBytes)
                    || (p.MediaType == MediaType.Video && p.SizeBytes > videoCapBytes)))
            .Select(p => p.Id)
            .ToList();
        return Task.FromResult<IReadOnlyList<Guid>>(mismatches);
    }

    public Task<IReadOnlyList<PhotoMonthBucket>> ListMonthBucketsAsync(
        Guid ownerId, string? sortBy, MediaType? mediaType, bool? isLive = null, CancellationToken cancellationToken = default)
    {
        var query = Photos.Where(p => p.OwnerId == ownerId);
        if (mediaType is not null)
        {
            query = query.Where(p => p.MediaType == mediaType);
        }

        if (isLive is not null)
        {
            query = query.Where(p => p.IsLive == isLive);
        }

        var owned = query.ToList();
        List<PhotoMonthBucket> buckets;
        if (sortBy == "createdAt")
        {
            buckets = owned
                .GroupBy(p => new DateTime(p.CreatedAt.Year, p.CreatedAt.Month, 1))
                .OrderByDescending(g => g.Key)
                .Select(g => new PhotoMonthBucket($"{g.Key.Year:D4}-{g.Key.Month:D2}", g.Count()))
                .ToList();
        }
        else
        {
            buckets = owned
                .Where(p => p.TakenAt is not null)
                .GroupBy(p => new DateTime(p.TakenAt!.Value.Year, p.TakenAt!.Value.Month, 1))
                .OrderByDescending(g => g.Key)
                .Select(g => new PhotoMonthBucket($"{g.Key.Year:D4}-{g.Key.Month:D2}", g.Count()))
                .ToList();
            var undated = owned.Count(p => p.TakenAt is null);
            if (undated > 0)
            {
                buckets.Add(new PhotoMonthBucket(string.Empty, undated));
            }
        }

        return Task.FromResult<IReadOnlyList<PhotoMonthBucket>>(buckets);
    }
}

public sealed class InMemoryVariantRepository : IVariantRepository
{
    public List<PhotoVariant> Variants { get; } = [];

    public Task AddAsync(PhotoVariant variant, CancellationToken cancellationToken = default)
    {
        Variants.Add(variant);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PhotoVariant>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<PhotoVariant>>(Variants.Where(v => v.PhotoId == photoId).ToList());

    public Task DeleteByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        Variants.RemoveAll(v => v.PhotoId == photoId);
        return Task.CompletedTask;
    }
}

public sealed class InMemoryVariantJobRepository : IVariantJobRepository
{
    public List<VariantJob> Jobs { get; } = [];

    /// <summary>Photo id → media kind; defaults to Photo when unregistered.</summary>
    public Dictionary<Guid, MediaType> MediaByPhoto { get; } = [];

    public Task<VariantJob> EnqueueAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        var job = VariantJob.Create(photoId, new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        Jobs.Add(job);
        return Task.FromResult(job);
    }

    public Task<VariantJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        var job = Jobs.FirstOrDefault(j => j.State == JobState.Queued);
        if (job is not null)
        {
            job.Start();
        }

        return Task.FromResult(job);
    }

    public Task<VariantJob?> DequeueNextAsync(MediaType kind, CancellationToken cancellationToken = default)
    {
        var job = Jobs.FirstOrDefault(j => j.State == JobState.Queued
            && MediaByPhoto.GetValueOrDefault(j.PhotoId, MediaType.Photo) == kind);
        if (job is not null)
        {
            job.Start();
        }

        return Task.FromResult(job);
    }

    public Task SaveAsync(VariantJob job, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

public sealed class InMemoryZipImportRepository : IZipImportRepository
{
    public List<ZipImportJob> Jobs { get; } = [];

    public Task<ZipImportJob> EnqueueAsync(ZipImportJob job, CancellationToken cancellationToken = default)
    {
        Jobs.Add(job);
        return Task.FromResult(job);
    }

    public Task SaveAsync(ZipImportJob job, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task NotifyJobsQueuedAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<ZipImportJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        var job = Jobs.FirstOrDefault(j => j.State == JobState.Queued);
        if (job is not null)
        {
            job.Start();
        }

        return Task.FromResult(job);
    }

    public Task<ZipImportJob?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default)
        => Task.FromResult(Jobs.FirstOrDefault(j => j.Id == id && j.OwnerId == ownerId));

    public Task<ZipImportJob?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Jobs.FirstOrDefault(j => j.Id == id));

    public Task<IReadOnlyList<ZipImportJob>> ListRecentForOwnerAsync(
        Guid ownerId, int limit, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<ZipImportJob>>(
            Jobs.Where(j => j.OwnerId == ownerId)
                .OrderByDescending(j => j.CreatedAt)
                .Take(limit)
                .ToList());

    public Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default)
    {
        var count = 0;
        foreach (var job in Jobs.Where(j => j.State == JobState.Processing))
        {
            job.State = JobState.Queued;
            count++;
        }

        return Task.FromResult(count);
    }

    public Task<int> FailStaleUploadsAsync(TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        var count = 0;
        foreach (var job in Jobs.Where(j => j.State == JobState.Uploading && j.CreatedAt < DateTimeOffset.UtcNow - maxAge))
        {
            job.FailUpload("Upload interrupted — the connection dropped or the server restarted.", DateTimeOffset.UtcNow);
            count++;
        }

        return Task.FromResult(count);
    }

    public Task<IReadOnlyList<ZipImportJob>> ListWithStagedBlobAsync(CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<ZipImportJob>>(
            Jobs.Where(j => (j.State == JobState.Failed || j.State == JobState.Done) && j.BlobDeletedAt == null)
                .ToList());
}

public sealed class InMemoryBillingPurchaseRepository : IBillingPurchaseRepository
{
    public List<BillingPurchase> Purchases { get; } = [];

    public Task<BillingPurchase> AddAsync(BillingPurchase purchase, CancellationToken cancellationToken = default)
    {
        Purchases.Add(purchase);
        return Task.FromResult(purchase);
    }

    public Task<BillingPurchase?> FindByTokenAsync(string purchaseToken, CancellationToken cancellationToken = default)
        => Task.FromResult(Purchases.FirstOrDefault(p => p.PurchaseToken == purchaseToken));

    public Task<BillingPurchase?> GetNewestForUserAsync(Guid userId, CancellationToken cancellationToken = default)
        => Task.FromResult(Purchases
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.ExpiresAt)
            .ThenByDescending(p => p.CreatedAt)
            .FirstOrDefault());

    public Task<bool> HasActiveForUserAsync(Guid userId, CancellationToken cancellationToken = default)
        => Task.FromResult(Purchases.Any(p => p.UserId == userId && p.State == BillingPurchaseState.Active));

    public Task<IReadOnlyList<BillingPurchase>> ListLapsedActiveAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<BillingPurchase>>(Purchases
            .Where(p => p.State == BillingPurchaseState.Active && p.ExpiresAt <= cutoff)
            .OrderBy(p => p.ExpiresAt)
            .ToList());
}

public sealed class FakeBillingProvider : IBillingProvider
{
    public string Name { get; set; } = "fake";

    public BillingValidation Result { get; set; } = new(BillingValidationState.Invalid, null);

    public int ValidationCount { get; private set; }

    public Task<BillingValidation> ValidatePurchaseAsync(
        string productId, string purchaseToken, CancellationToken cancellationToken = default)
    {
        ValidationCount++;
        return Task.FromResult(Result);
    }
}

public sealed class FakeHeifConverter : IHeifConverter
{
    private int _counter;

    public bool Called { get; private set; }

    public Exception? ThrowOnConvert { get; set; }

    public Task<HeifConversionResult> ConvertToJpegAsync(Stream heif, CancellationToken cancellationToken = default)
    {
        Called = true;
        if (ThrowOnConvert is not null)
        {
            throw ThrowOnConvert;
        }

        // Unique content per call — real conversions of distinct inputs never collide.
        var bytes = Encoding.UTF8.GetBytes($"fake-jpeg-{++_counter}");
        return Task.FromResult(new HeifConversionResult(new MemoryStream(bytes), 8, 8, bytes.Length));
    }
}

public sealed class FakeBlobStorage : IBlobStorage
{
    public Dictionary<string, byte[]> Blobs { get; } = [];

    /// <summary>Upload URL handed out by <see cref="TryCreateUploadUrlAsync"/>; null simulates a
    /// storage backend that cannot presign direct uploads.</summary>
    public string? UploadUrl { get; set; } = "https://storage.test/presigned-put";

    public List<string> PresignRequests { get; } = [];

    public Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default)
    {
        using var buffer = new MemoryStream();
        content.CopyTo(buffer);
        Blobs[path] = buffer.ToArray();
        return Task.CompletedTask;
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
        => Blobs.TryGetValue(path, out var bytes)
            ? Task.FromResult<Stream>(new MemoryStream(bytes, writable: false))
            : throw new KeyNotFoundException($"Blob '{path}' not found.");

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        Blobs.Remove(path);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
        => Task.FromResult(Blobs.ContainsKey(path));

    public Task<BlobUploadUrl?> TryCreateUploadUrlAsync(
        string path, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default)
    {
        PresignRequests.Add(path);
        return Task.FromResult<BlobUploadUrl?>(
            UploadUrl is null ? null : new BlobUploadUrl($"{UploadUrl}?key={Uri.EscapeDataString(path)}", DateTimeOffset.UtcNow + expiry));
    }

    /// <summary>Null simulates a provider that cannot presign multipart uploads.</summary>
    public bool MultipartEnabled { get; set; } = true;

    public List<string> MultipartSessions { get; } = [];
    public List<string> CompletedSessions { get; } = [];
    public List<string> AbortedSessions { get; } = [];
    public List<(string Path, IReadOnlyList<BlobPartETag> Parts)> CompletedParts { get; } = [];

    public Task<string?> TryCreateMultipartUploadAsync(string path, string? contentType, CancellationToken cancellationToken = default)
    {
        if (!MultipartEnabled)
        {
            return Task.FromResult<string?>(null);
        }

        var uploadId = $"mp-{Guid.NewGuid():N}";
        MultipartSessions.Add(uploadId);
        return Task.FromResult<string?>(uploadId);
    }

    public Task<BlobUploadUrl?> TryCreatePartUrlAsync(
        string path, string uploadId, int partNumber, TimeSpan expiry, CancellationToken cancellationToken = default)
        => Task.FromResult<BlobUploadUrl?>(
            MultipartSessions.Contains(uploadId)
                ? new BlobUploadUrl($"https://storage.test/part/{uploadId}/{partNumber}", DateTimeOffset.UtcNow + expiry)
                : null);

    public Task CompleteMultipartUploadAsync(
        string path, string uploadId, IReadOnlyList<BlobPartETag> parts, CancellationToken cancellationToken = default)
    {
        CompletedSessions.Add(uploadId);
        CompletedParts.Add((path, parts));
        Blobs[path] = [1, 2, 3];
        return Task.CompletedTask;
    }

    public Task AbortMultipartUploadAsync(string path, string uploadId, CancellationToken cancellationToken = default)
    {
        AbortedSessions.Add(uploadId);
        MultipartSessions.Remove(uploadId);
        return Task.CompletedTask;
    }
}

public sealed class FakeUnitOfWork : IUnitOfWork
{
    public int SaveCount { get; private set; }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveCount++;
        return Task.FromResult(0);
    }
}

public sealed class FakeImageVariantGenerator : IImageVariantGenerator
{
    public Exception? ThrowOnGenerate { get; set; }

    public Task<VariantOutput> GenerateAsync(Stream original, VariantKind kind, CancellationToken cancellationToken = default)
    {
        if (ThrowOnGenerate is not null)
        {
            throw ThrowOnGenerate;
        }

        var bytes = System.Text.Encoding.UTF8.GetBytes($"variant-{kind}");
        return Task.FromResult(new VariantOutput(new MemoryStream(bytes), 10, 5, "jpeg", bytes.Length));
    }
}

public sealed class FakeExifExtractor : IExifExtractor
{
    public PhotoMetadata Metadata { get; set; } = new(
        4032, 3024,
        new DateTimeOffset(2025, 12, 25, 10, 30, 0, TimeSpan.Zero),
        "Google", "Pixel 9", -22.9, -43.2);

    public Task<PhotoMetadata> ExtractAsync(Stream original, CancellationToken cancellationToken = default)
        => Task.FromResult(Metadata);
}

public sealed class FakeVideoProcessor : IVideoProcessor
{
    public Exception? ThrowOnProcess { get; set; }

    public VideoInfo Info { get; set; } = new(1920, 1080, 12.5, null);

    public Task<VideoProcessingResult> ProcessAsync(Stream video, CancellationToken cancellationToken = default)
    {
        if (ThrowOnProcess is not null)
        {
            throw ThrowOnProcess;
        }

        // Unique poster content per call — real extractions of distinct inputs never collide.
        var bytes = Encoding.UTF8.GetBytes($"fake-poster-{Guid.NewGuid():N}");
        return Task.FromResult(new VideoProcessingResult(
            Info,
            new VideoPoster(new MemoryStream(bytes), Info.Width, Info.Height, bytes.Length)));
    }
}

public sealed class FakeImageCompressor(Func<Stream, long, Stream>? impl = null) : IImageCompressor
{
    public int CallCount { get; private set; }

    public Task<Stream> CompressToFitAsync(Stream image, long maxBytes, CancellationToken cancellationToken = default)
    {
        CallCount++;
        image.Position = 0;
        return Task.FromResult(impl?.Invoke(image, maxBytes) ?? image);
    }
}

public sealed class FakeVideoCompressor(Func<Stream, long, int, Stream>? impl = null) : IVideoCompressor
{
    public int CallCount { get; private set; }

    public int? LastMaxHeight { get; private set; }

    public Task<Stream> CompressToFitAsync(Stream video, long maxBytes, int maxHeight = 0, CancellationToken cancellationToken = default)
    {
        CallCount++;
        LastMaxHeight = maxHeight;
        video.Position = 0;
        return Task.FromResult(impl?.Invoke(video, maxBytes, maxHeight) ?? video);
    }
}

// ── doc 18: ML queue fakes ──────────────────────────────────────────────────

public sealed class InMemoryMlJobRepository : IMlJobRepository
{
    public List<MlJob> Jobs { get; } = [];

    public Task<MlJob> EnqueueAsync(Guid ownerId, Guid? photoId, MlJobKind kind, CancellationToken cancellationToken = default)
    {
        var job = MlJob.Create(ownerId, photoId, kind, DateTimeOffset.UtcNow);
        Jobs.Add(job);
        return Task.FromResult(job);
    }

    public Task<bool> HasPendingAsync(Guid ownerId, MlJobKind kind, CancellationToken cancellationToken = default) =>
        Task.FromResult(Jobs.Any(j => j.OwnerId == ownerId && j.Kind == kind && j.State is MlJobState.Queued or MlJobState.Processing));

    public Task<MlJob?> DequeueNextAsync(MlJobKind kind, CancellationToken cancellationToken = default)
    {
        var job = Jobs.Where(j => j.Kind == kind && j.State == MlJobState.Queued)
            .OrderBy(j => j.CreatedAt)
            .FirstOrDefault();
        job?.Start();
        return Task.FromResult(job);
    }

    public Task SaveAsync(MlJob job, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default) => Task.FromResult(0);

    public Task<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>> ListReadyPhotosWithoutFacesAsync(int limit, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>>([]);

    public Task<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>> ListReadyPhotosWithoutLabelsAsync(int limit, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>>([]);
}

/// <summary>MlJobEnqueuer factory for service tests: disabled by default (no jobs
/// enqueued), or enabled against an in-memory queue the test can inspect.</summary>
public static class TestMlJobs
{
    public static MlJobEnqueuer CreateEnqueuer(InMemoryMlJobRepository? repository = null, bool enabled = false) =>
        new(
            repository ?? new InMemoryMlJobRepository(),
            Microsoft.Extensions.Options.Options.Create(new AiOptions { Enabled = enabled }),
            Microsoft.Extensions.Options.Options.Create(new VisionOptions()),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<MlJobEnqueuer>.Instance);
}
