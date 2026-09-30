using iPhotos.Application.Common;

namespace iPhotos.Infrastructure.Persistence;

public sealed class UnitOfWork(PhotosDbContext db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        db.SaveChangesAsync(cancellationToken);
}
