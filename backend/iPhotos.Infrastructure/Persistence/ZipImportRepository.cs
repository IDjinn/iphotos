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

    public async Task<int> RequeueStuckAsync(CancellationToken cancellationToken = default)
        => await db.Database.ExecuteSqlAsync(
            $"UPDATE zip_import_jobs SET state = 'Queued' WHERE state = 'Processing'");
}
