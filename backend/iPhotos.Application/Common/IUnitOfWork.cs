namespace iPhotos.Application.Common;

/// <summary>A unit of work started by <see cref="IUnitOfWork.BeginTransactionAsync"/>.
/// Disposing without committing rolls the work back.</summary>
public interface IUnitOfWorkTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken = default);
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>Groups the following SaveChanges/ExecuteUpdate work into one atomic
    /// commit — an early dispose (or a cancelled request) rolls everything back.</summary>
    Task<IUnitOfWorkTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);
}
