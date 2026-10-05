using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

public sealed class ZipImportRepository(PhotosDbContext db) : IZipImportRepository
{
    public async Task<ZipImportJob> EnqueueAsync(ZipImportJob job, CancellationToken cancellationToken = default)
    {
        db.ZipImportJobs.Add(job);
        await db.SaveChangesAsync(cancellationToken);
        return job;
    }

    public async Task SaveAsync(ZipImportJob job, CancellationToken cancellationToken = default)
    {
        db.ZipImportJobs.Update(job);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task NotifyJobsQueuedAsync(CancellationToken cancellationToken = default)
        => await db.Database.ExecuteSqlAsync(
            $"SELECT pg_notify('iphotos_jobs_queued', 'zip_import_jobs')", cancellationToken);

    public async Task<ZipImportJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Scalar claim with row lock; the "Value" alias matches SqlQuery conventions.
        var jobId = await db.Database
            .SqlQuery<Guid>($"""
                SELECT id AS "Value" FROM zip_import_jobs
                WHERE state = 'Queued'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """)
            .FirstOrDefaultAsync(cancellationToken);

        if (jobId == default)
        {
            return null;
        }

        var job = await db.ZipImportJobs.FirstAsync(j => j.Id == jobId, cancellationToken);
        job.Start();
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return job;
    }

    public Task<ZipImportJob?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default)
        => db.ZipImportJobs.FirstOrDefaultAsync(j => j.Id == id && j.OwnerId == ownerId, cancellationToken);

    public Task<ZipImportJob?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => db.ZipImportJobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);

    public async Task<IReadOnlyList<ZipImportJob>> ListRecentForOwnerAsync(
        Guid ownerId, int limit, CancellationToken cancellationToken = default)
        => await db.ZipImportJobs
            .AsNoTracking()
            .Where(j => j.OwnerId == ownerId)
            .OrderByDescending(j => j.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default)
        => await db.Database.ExecuteSqlAsync(
            $"UPDATE zip_import_jobs SET state = 'Queued' WHERE state = 'Processing'");

    public async Task<int> FailStaleUploadsAsync(TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTimeOffset.UtcNow - maxAge;
        return await db.Database.ExecuteSqlAsync($"""
            UPDATE zip_import_jobs
            SET state = 'Failed',
                last_error = 'Upload interrupted — the connection dropped or the server restarted.',
                processed_at = NOW()
            WHERE state = 'Uploading' AND created_at < {cutoff}
            """, cancellationToken);
    }
}
