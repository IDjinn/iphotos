using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

public sealed class VariantJobRepository(PhotosDbContext db) : IVariantJobRepository
{
    public async Task<VariantJob> EnqueueAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        var job = VariantJob.Create(photoId, DateTimeOffset.UtcNow);
        db.VariantJobs.Add(job);
        await db.SaveChangesAsync(cancellationToken);
        return job;
    }

    public async Task<VariantJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Scalar claim with row lock; the "Value" alias matches SqlQuery conventions.
        var jobId = await db.Database
            .SqlQuery<Guid>($"""
                SELECT id AS "Value" FROM variant_jobs
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

        var job = await db.VariantJobs.FirstAsync(j => j.Id == jobId, cancellationToken);
        job.Start();
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return job;
    }
}
