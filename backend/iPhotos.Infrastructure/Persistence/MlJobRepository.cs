using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

/// <summary>Row shape for the backfill queries (EF unmapped SqlQuery projection).</summary>
public sealed class BackfillPhotoRow
{
    public Guid PhotoId { get; set; }
    public Guid OwnerId { get; set; }
}

public sealed class MlJobRepository(PhotosDbContext db) : IMlJobRepository
{
    public async Task<MlJob> EnqueueAsync(Guid ownerId, Guid? photoId, MlJobKind kind, CancellationToken cancellationToken = default)
    {
        var job = MlJob.Create(ownerId, photoId, kind, DateTimeOffset.UtcNow);
        db.MlJobs.Add(job);
        await db.SaveChangesAsync(cancellationToken);
        return job;
    }

    public Task<bool> HasPendingAsync(Guid ownerId, MlJobKind kind, CancellationToken cancellationToken = default) =>
        db.MlJobs.AnyAsync(
            j => j.OwnerId == ownerId && j.Kind == kind && (j.State == MlJobState.Queued || j.State == MlJobState.Processing),
            cancellationToken);

    public async Task<MlJob?> DequeueNextAsync(MlJobKind kind, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Scalar claim with row lock; the "Value" alias matches SqlQuery conventions.
        var jobId = await db.Database
            .SqlQuery<Guid>($"""
                SELECT id AS "Value" FROM ml_jobs
                WHERE state = 'Queued' AND kind = {kind.ToString()}
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """)
            .FirstOrDefaultAsync(cancellationToken);

        if (jobId == default)
        {
            return null;
        }

        var job = await db.MlJobs.FirstAsync(j => j.Id == jobId, cancellationToken);
        job.Start();
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return job;
    }

    public async Task SaveAsync(MlJob job, CancellationToken cancellationToken = default)
    {
        db.MlJobs.Update(job);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default) =>
        await db.MlJobs
            .Where(j => j.State == MlJobState.Processing)
            .ExecuteUpdateAsync(set => set
                .SetProperty(j => j.State, MlJobState.Queued)
                .SetProperty(j => j.LastError, (string?)null), cancellationToken);

    public async Task<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>> ListReadyPhotosWithoutFacesAsync(int limit, CancellationToken cancellationToken = default)
    {
        // Column aliases follow the snake_case convention the context applies to
        // the unmapped row type (PhotoId → photo_id).
        var rows = await db.Database
            .SqlQuery<BackfillPhotoRow>($"""
                SELECT p.id AS photo_id, p.owner_id AS owner_id
                FROM photos p
                LEFT JOIN photo_faces f ON f.photo_id = p.id
                WHERE p.state = 'Ready' AND p.media_type = 'Photo' AND f.id IS NULL
                ORDER BY p.created_at
                LIMIT {limit}
                """)
            .ToListAsync(cancellationToken);
        return rows.Select(r => (r.PhotoId, r.OwnerId)).ToList();
    }

    public async Task<IReadOnlyList<(Guid PhotoId, Guid OwnerId)>> ListReadyPhotosWithoutLabelsAsync(int limit, CancellationToken cancellationToken = default)
    {
        var rows = await db.Database
            .SqlQuery<BackfillPhotoRow>($"""
                SELECT p.id AS photo_id, p.owner_id AS owner_id
                FROM photos p
                LEFT JOIN photo_labels l ON l.photo_id = p.id
                WHERE p.state = 'Ready' AND p.media_type = 'Photo' AND l.photo_id IS NULL
                ORDER BY p.created_at
                LIMIT {limit}
                """)
            .ToListAsync(cancellationToken);
        return rows.Select(r => (r.PhotoId, r.OwnerId)).ToList();
    }
}
