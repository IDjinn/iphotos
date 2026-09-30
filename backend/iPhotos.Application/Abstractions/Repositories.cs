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

    Task DeleteAsync(Photo photo, CancellationToken cancellationToken = default);

    /// <summary>Raw usage for the owner: total bytes (originals + variants) plus asset counts.</summary>
    Task<UsageStats> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default);
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
}
