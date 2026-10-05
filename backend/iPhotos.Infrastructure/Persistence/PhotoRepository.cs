using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

public sealed class PhotoRepository(PhotosDbContext db) : IPhotoRepository
{
    public async Task<Photo> AddAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        db.Photos.Add(photo);
        await db.SaveChangesAsync(cancellationToken);
        return photo;
    }

    public Task<Photo?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        db.Photos.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

    public Task<Photo?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default) =>
        db.Photos.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == ownerId, cancellationToken);

    public Task<Photo?> FindByContentHashAsync(Guid ownerId, string contentHash, CancellationToken cancellationToken = default) =>
        db.Photos.FirstOrDefaultAsync(p => p.OwnerId == ownerId && p.ContentHash == contentHash, cancellationToken);

    public async Task<PagedResult<Photo>> ListAsync(PhotoFilter filter, CancellationToken cancellationToken = default)
    {
        var query = db.Photos.AsNoTracking().Where(p => p.OwnerId == filter.OwnerId);

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
            var term = filter.FileName.Trim().ToLower();
            query = query.Where(p => p.FileName.ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(filter.Camera))
        {
            var term = filter.Camera.Trim().ToLower();
            query = query.Where(p =>
                p.CameraMake != null && p.CameraMake.ToLower().Contains(term)
                || p.CameraModel != null && p.CameraModel.ToLower().Contains(term));
        }

        if (filter.MediaType is not null)
        {
            query = query.Where(p => p.MediaType == filter.MediaType);
        }

        // Sort field/direction come validated from the endpoint; defaults keep the
        // historical newest-taken-first order. NULLS LAST on desc, NULLS FIRST on asc.
        var descending = filter.Order is null || filter.Order == "desc";
        if (filter.SortBy == "createdAt")
        {
            query = descending
                ? query.OrderByDescending(p => p.CreatedAt)
                : query.OrderBy(p => p.CreatedAt);
        }
        else if (descending)
        {
            query = query
                .OrderByDescending(p => p.TakenAt != null)
                .ThenByDescending(p => p.TakenAt)
                .ThenByDescending(p => p.CreatedAt);
        }
        else
        {
            query = query
                .OrderBy(p => p.TakenAt != null)
                .ThenBy(p => p.TakenAt)
                .ThenBy(p => p.CreatedAt);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Photo>(items, filter.Page, filter.PageSize, total);
    }

    public async Task DeleteAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        db.Photos.Remove(photo);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Photo>> ListStalePendingUploadsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default) =>
        await db.Photos
            .Where(p => p.State == PhotoState.PendingUpload && p.CreatedAt <= cutoff)
            .ToListAsync(cancellationToken);

    public async Task<UsageStats> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var photos = db.Photos.Where(p => p.OwnerId == ownerId);
        var ownedVariants = db.PhotoVariants
            .Where(v => db.Photos.Any(p => p.Id == v.PhotoId && p.OwnerId == ownerId));

        var usedBytes = await photos.SumAsync(p => (long?)p.SizeBytes, cancellationToken) ?? 0;
        usedBytes += await ownedVariants
            .Where(v => v.Kind != VariantKind.Original)
            .SumAsync(v => (long?)v.SizeBytes, cancellationToken) ?? 0;

        var photoCount = await photos.CountAsync(cancellationToken);
        var variantCount = await ownedVariants.CountAsync(cancellationToken);

        return new UsageStats(usedBytes, photoCount, variantCount);
    }
}

public sealed class VariantRepository(PhotosDbContext db) : IVariantRepository
{
    public async Task AddAsync(PhotoVariant variant, CancellationToken cancellationToken = default)
    {
        db.PhotoVariants.Add(variant);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PhotoVariant>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default) =>
        await db.PhotoVariants.AsNoTracking()
            .Where(v => v.PhotoId == photoId)
            .OrderBy(v => v.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task DeleteByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        await db.PhotoVariants
            .Where(v => v.PhotoId == photoId)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
