using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

public sealed class BillingPurchaseRepository(PhotosDbContext db) : IBillingPurchaseRepository
{
    public async Task<BillingPurchase> AddAsync(BillingPurchase purchase, CancellationToken cancellationToken = default)
    {
        db.BillingPurchases.Add(purchase);
        await db.SaveChangesAsync(cancellationToken);
        return purchase;
    }

    public Task<BillingPurchase?> FindByTokenAsync(string purchaseToken, CancellationToken cancellationToken = default)
        => db.BillingPurchases.FirstOrDefaultAsync(p => p.PurchaseToken == purchaseToken, cancellationToken);

    public Task<BillingPurchase?> GetNewestForUserAsync(Guid userId, CancellationToken cancellationToken = default)
        => db.BillingPurchases
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.ExpiresAt)
            .ThenByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<bool> HasActiveForUserAsync(Guid userId, CancellationToken cancellationToken = default)
        => db.BillingPurchases.AnyAsync(
            p => p.UserId == userId && p.State == BillingPurchaseState.Active, cancellationToken);

    public async Task<IReadOnlyList<BillingPurchase>> ListLapsedActiveAsync(DateTimeOffset cutoff, CancellationToken cancellationToken = default)
        => await db.BillingPurchases
            .Where(p => p.State == BillingPurchaseState.Active && p.ExpiresAt <= cutoff)
            .OrderBy(p => p.ExpiresAt)
            .ToListAsync(cancellationToken);
}
