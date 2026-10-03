using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Verifies purchase tokens through the configured <see cref="IBillingProvider"/> and
/// applies the granted tier to the user (plan + storage quota — the single source of
/// truth enforced on upload). Never trusts client claims: an invalid, reused or
/// expired token never changes the plan. Photos are never touched here; an expired
/// subscription only gates new uploads through the quota.
/// </summary>
public sealed class BillingService(
    IBillingPurchaseRepository purchases,
    IUserRepository users,
    IBillingProvider provider,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<BillingOptions> optionsAccessor,
    IOptions<StorageOptions> storageOptions)
{
    public async Task<BillingStatusDto> GetStatusAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");

        return await BuildStatusAsync(user, cancellationToken);
    }

    public async Task<BillingProductsResponse> GetProductsAsync(CancellationToken cancellationToken = default)
    {
        var options = optionsAccessor.Value;
        var products = options.Products
            .Select(kvp => new BillingProductDto(kvp.Key, kvp.Value.DisplayName, kvp.Value.DisplayPrice, kvp.Value.QuotaBytes))
            .OrderBy(p => p.QuotaBytes)
            .ToList();

        return await Task.FromResult(new BillingProductsResponse(options.Sandbox, products));
    }

    /// <summary>Idempotent: a token that already activated a subscription returns the current status;
    /// a token linked to another account is rejected.</summary>
    public async Task<BillingStatusDto> VerifyPurchaseAsync(
        Guid userId, string productId, string purchaseToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(purchaseToken))
        {
            throw new ValidationException("Purchase token is required.");
        }

        var product = optionsAccessor.Value.FindProduct(productId)
            ?? throw new ValidationException($"Unknown product '{productId}'.");

        var existing = await purchases.FindByTokenAsync(purchaseToken, cancellationToken);
        if (existing is not null)
        {
            if (existing.UserId != userId)
            {
                throw new InvalidPurchaseException("The purchase token is linked to another account.");
            }

            return await BuildStatusForAsync(userId, cancellationToken);
        }

        var validation = await provider.ValidatePurchaseAsync(productId, purchaseToken, cancellationToken);
        if (validation.State != BillingValidationState.Valid || validation.ExpiresAt is not { } expiresAt)
        {
            throw new InvalidPurchaseException(validation.State switch
            {
                BillingValidationState.Expired => "The purchase has expired.",
                BillingValidationState.Refunded => "The purchase was refunded.",
                _ => "The purchase token could not be verified.",
            });
        }

        var now = dateTime.UtcNow;
        var purchase = BillingPurchase.Create(
            userId, provider.Name, productId, purchaseToken, product.QuotaBytes, expiresAt, now);
        await purchases.AddAsync(purchase, cancellationToken);

        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");
        user.Plan = productId;
        user.StorageQuotaBytes = product.QuotaBytes;
        user.UpdatedAt = now;
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return await BuildStatusAsync(user, cancellationToken);
    }

    /// <summary>Revalidates a token already linked to this account (reinstall / store refresh):
    /// re-applies the tier when the store still reports the purchase as valid, revokes it on refund.</summary>
    public async Task<BillingStatusDto> RestorePurchaseAsync(
        Guid userId, string purchaseToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(purchaseToken))
        {
            throw new ValidationException("Purchase token is required.");
        }

        var purchase = await purchases.FindByTokenAsync(purchaseToken, cancellationToken)
            ?? throw new NotFoundException("No purchase is associated with the given token.");
        if (purchase.UserId != userId)
        {
            throw new InvalidPurchaseException("The purchase token is linked to another account.");
        }

        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");

        var validation = await provider.ValidatePurchaseAsync(purchase.ProductId, purchaseToken, cancellationToken);
        var now = dateTime.UtcNow;
        switch (validation)
        {
            case { State: BillingValidationState.Valid, ExpiresAt: { } expiresAt }:
                purchase.Activate(expiresAt, now);
                user.Plan = purchase.ProductId;
                user.StorageQuotaBytes = purchase.QuotaBytes;
                user.UpdatedAt = now;
                break;
            case { State: BillingValidationState.Refunded } when purchase.State == BillingPurchaseState.Active:
                purchase.Revoke(now);
                await DowngradeIfNoActivePurchaseAsync(user, cancellationToken);
                break;
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildStatusAsync(user, cancellationToken);
    }

    private async Task<BillingStatusDto> BuildStatusForAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");
        return await BuildStatusAsync(user, cancellationToken);
    }

    private async Task<BillingStatusDto> BuildStatusAsync(User user, CancellationToken cancellationToken)
    {
        var now = dateTime.UtcNow;
        var grace = TimeSpan.FromDays(Math.Max(0, optionsAccessor.Value.GracePeriodDays));

        // The newest purchase drives what the user sees: an Active row resolves to
        // active/grace/expired; a lapsed one keeps reporting Expired (renewal cue)
        // and a revoked one reads as plain Free, until a new subscription lands.
        var current = await purchases.GetNewestForUserAsync(user.Id, cancellationToken);
        if (current is null)
        {
            return new BillingStatusDto(user.Plan, BillingSubscriptionState.Free, user.StorageQuotaBytes, null);
        }

        if (current.State == BillingPurchaseState.Active)
        {
            if (now < current.ExpiresAt)
            {
                return new BillingStatusDto(current.ProductId, BillingSubscriptionState.Active, current.QuotaBytes, current.ExpiresAt);
            }

            if (now < current.ExpiresAt + grace)
            {
                return new BillingStatusDto(current.ProductId, BillingSubscriptionState.Grace, current.QuotaBytes, current.ExpiresAt);
            }
        }

        if (current.State == BillingPurchaseState.Revoked)
        {
            return new BillingStatusDto(user.Plan, BillingSubscriptionState.Free, user.StorageQuotaBytes, current.ExpiresAt);
        }

        return new BillingStatusDto(user.Plan, BillingSubscriptionState.Expired, user.StorageQuotaBytes, current.ExpiresAt);
    }

    private async Task DowngradeIfNoActivePurchaseAsync(User user, CancellationToken cancellationToken)
    {
        if (!await purchases.HasActiveForUserAsync(user.Id, cancellationToken))
        {
            user.Plan = "free";
            user.StorageQuotaBytes = storageOptions.Value.DefaultQuotaBytes;
            user.UpdatedAt = dateTime.UtcNow;
        }
    }
}
