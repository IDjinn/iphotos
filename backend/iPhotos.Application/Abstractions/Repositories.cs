using iPhotos.Domain;

namespace iPhotos.Application.Abstractions;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<User> AddAsync(User user, CancellationToken cancellationToken = default);
}

public interface IRefreshTokenRepository
{
    Task AddAsync(RefreshToken token, CancellationToken cancellationToken = default);

    Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken cancellationToken = default);
}

public interface IPhotoRepository
{
    Task<Photo> AddAsync(Photo photo, CancellationToken cancellationToken = default);

    /// <summary>Unscoped lookup (used by the variant worker).</summary>
    Task<Photo?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<Photo?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default);

    Task<Photo?> FindByContentHashAsync(Guid ownerId, string contentHash, CancellationToken cancellationToken = default);

    Task<PagedResult<Photo>> ListAsync(PhotoFilter filter, CancellationToken cancellationToken = default);

    /// <summary>
    /// Month buckets of the owner's photos in listing order: dated photos
    /// grouped by TakenAt month ("yyyy-MM", newest first) and any undated
    /// photos last under month "" — mirroring the listing's nulls-last
    /// TakenAt sort. <paramref name="sortBy"/> = "createdAt" buckets by
    /// CreatedAt instead (no undated bucket). Pairs with the listing filters
    /// so clients can map timeline positions to months.
    /// </summary>
    Task<IReadOnlyList<PhotoMonthBucket>> ListMonthBucketsAsync(
        Guid ownerId, string? sortBy, MediaType? mediaType, CancellationToken cancellationToken = default);

    Task DeleteAsync(Photo photo, CancellationToken cancellationToken = default);

    /// <summary>Photos with an upload ticket older than <paramref name="cutoff"/> that never completed.</summary>
    Task<IReadOnlyList<Photo>> ListStalePendingUploadsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default);

    /// <summary>Raw usage for the owner: total bytes (originals + variants) plus asset counts.</summary>
    Task<UsageStats> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Ready photos whose stored bytes don't match the given upload quality and can be
    /// rewritten by the worker: for storage-saver, original-quality photos over the saver
    /// caps (original mode has no actionable mismatches — compressed bytes are final).
    /// </summary>
    Task<IReadOnlyList<Guid>> ListQualityMismatchIdsAsync(
        Guid ownerId, string uploadQuality, long imageCapBytes, long videoCapBytes, CancellationToken cancellationToken = default);
}

public interface IVariantRepository
{
    Task AddAsync(PhotoVariant variant, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PhotoVariant>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default);

    Task DeleteByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default);
}

public interface IVariantJobRepository
{
    Task<VariantJob> EnqueueAsync(Guid photoId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically claims the oldest queued job (FOR UPDATE SKIP LOCKED in PostgreSQL),
    /// moving it to Processing. Returns null when the queue is empty.
    /// </summary>
    Task<VariantJob?> DequeueNextAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Same claim as <see cref="DequeueNextAsync"/> but restricted to jobs whose photo
    /// is of the given media kind — the worker's fast (photo) and slow (video) lanes
    /// pull from disjoint slices of the same queue.
    /// </summary>
    Task<VariantJob?> DequeueNextAsync(MediaType kind, CancellationToken cancellationToken = default);

    /// <summary>Persists mutations made to a job (state transitions, retry counters).</summary>
    Task SaveAsync(VariantJob job, CancellationToken cancellationToken = default);
}

public interface IZipImportRepository
{
    Task<ZipImportJob> EnqueueAsync(ZipImportJob job, CancellationToken cancellationToken = default);

    /// <summary>Persists mutations made to a tracked job (state transitions, counters).</summary>
    Task SaveAsync(ZipImportJob job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Wakes the import worker immediately (Postgres LISTEN/NOTIFY). Used when a
    /// job becomes Queued outside of an INSERT — e.g. when an upload finishes
    /// staging — since the queue trigger only fires on INSERT.
    /// </summary>
    Task NotifyJobsQueuedAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically claims the oldest queued job (FOR UPDATE SKIP LOCKED in PostgreSQL),
    /// moving it to Processing. Returns null when the queue is empty.
    /// </summary>
    Task<ZipImportJob?> DequeueNextAsync(CancellationToken cancellationToken = default);

    Task<ZipImportJob?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default);

    /// <summary>Finds a job by id regardless of owner — used to reject duplicate client-supplied ids.</summary>
    Task<ZipImportJob?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Lists the owner's most recent import jobs, newest first. Backs the web
    /// import panel, which restores the queue view (and its polling) after a
    /// page reload.
    /// </summary>
    Task<IReadOnlyList<ZipImportJob>> ListRecentForOwnerAsync(Guid ownerId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Moves jobs stranded in Processing (worker crash mid-import) back to Queued.
    /// Safe by design: hash dedup turns already-imported entries into duplicates.
    /// </summary>
    Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Permanently fails Uploading jobs older than <paramref name="maxAge"/> —
    /// their HTTP upload died with a previous API process, so the bytes are gone.
    /// Runs at worker startup. Returns the number of jobs failed.
    /// </summary>
    Task<int> FailStaleUploadsAsync(TimeSpan maxAge, CancellationToken cancellationToken = default);
}

public interface IBillingPurchaseRepository
{
    Task<BillingPurchase> AddAsync(BillingPurchase purchase, CancellationToken cancellationToken = default);

    Task<BillingPurchase?> FindByTokenAsync(string purchaseToken, CancellationToken cancellationToken = default);

    /// <summary>The user's most recent purchase in any state (newest expiry first) — drives the visible subscription status.</summary>
    Task<BillingPurchase?> GetNewestForUserAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<bool> HasActiveForUserAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Active purchases whose grace period ended before <paramref name="cutoff"/>.</summary>
    Task<IReadOnlyList<BillingPurchase>> ListLapsedActiveAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default);
}
