using iPhotos.Application.Common;

namespace iPhotos.Infrastructure.Persistence;

public sealed class UnitOfWork(PhotosDbContext db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        db.SaveChangesAsync(cancellationToken);

    public async Task<IUnitOfWorkTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default)
    {
        await db.Database.BeginTransactionAsync(cancellationToken);
        return new DbContextTransaction(db);
    }

    /// <summary>Wraps the ambient EF transaction; a dispose without commit rolls back.</summary>
    private sealed class DbContextTransaction(PhotosDbContext db) : IUnitOfWorkTransaction
    {
        public async Task CommitAsync(CancellationToken cancellationToken = default) =>
            await db.Database.CommitTransactionAsync(cancellationToken);

        public async ValueTask DisposeAsync()
        {
            if (db.Database.CurrentTransaction is { } current)
            {
                await current.DisposeAsync();
            }
        }
    }
}
