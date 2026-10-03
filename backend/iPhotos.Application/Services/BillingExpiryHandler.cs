using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Expires purchases whose grace period has run out and downgrades users without any
/// remaining active subscription back to the free plan/quota. Executed periodically by
/// the iPhotos.Worker billing sweep. Never deletes photos — the free quota only gates
/// new uploads (413) once usage exceeds it again.
/// </summary>
public sealed class BillingExpiryHandler(
    IBillingPurchaseRepository purchases,
    IUserRepository users,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<BillingOptions> optionsAccessor,
    IOptions<StorageOptions> storageOptions,
    ILogger<BillingExpiryHandler> logger)
{
    /// <summary>Returns the number of purchases transitioned to Expired.</summary>
    public async Task<int> ExpireLapsedPurchasesAsync(CancellationToken cancellationToken = default)
    {
        var now = dateTime.UtcNow;
        var cutoff = now - TimeSpan.FromDays(Math.Max(0, optionsAccessor.Value.GracePeriodDays));
        var lapsed = await purchases.ListLapsedActiveAsync(cutoff, cancellationToken);
        if (lapsed.Count == 0)
        {
            return 0;
        }

        // Persist the expiry before downgrading: HasActiveForUserAsync queries the
        // database, so the lapsed rows must read Expired there for the check to see
        // the user's true remaining subscriptions.
        foreach (var purchase in lapsed)
        {
            purchase.MarkExpired(now);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var downgraded = 0;
        foreach (var userId in lapsed.Select(p => p.UserId).Distinct())
        {
            var user = await users.GetByIdAsync(userId, cancellationToken);
            if (user is null)
            {
                continue;
            }

            if (!await purchases.HasActiveForUserAsync(user.Id, cancellationToken))
            {
                user.Plan = "free";
                user.StorageQuotaBytes = storageOptions.Value.DefaultQuotaBytes;
                user.UpdatedAt = now;
                downgraded++;
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Billing sweep: {Lapsed} purchase(s) lapsed, {Downgraded} user(s) downgraded to free",
            lapsed.Count, downgraded);
        return lapsed.Count;
    }
}
