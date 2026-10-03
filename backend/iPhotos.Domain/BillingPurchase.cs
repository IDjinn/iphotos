namespace iPhotos.Domain;

public enum BillingPurchaseState
{
    Active,
    Expired,
    Revoked,
}

/// <summary>
/// One verified purchase of a storage subscription (one row per purchase token).
/// The granted quota is denormalized so historical purchases keep their tier even
/// when the product catalog changes. Photos are never deleted by billing state —
/// an expired subscription only gates new uploads through the user quota.
/// </summary>
public sealed class BillingPurchase
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string ProductId { get; set; } = string.Empty;
    public string PurchaseToken { get; set; } = string.Empty;
    public BillingPurchaseState State { get; set; }
    public long QuotaBytes { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static BillingPurchase Create(
        Guid userId,
        string provider,
        string productId,
        string purchaseToken,
        long quotaBytes,
        DateTimeOffset expiresAt,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Provider = provider,
        ProductId = productId,
        PurchaseToken = purchaseToken,
        State = BillingPurchaseState.Active,
        QuotaBytes = quotaBytes,
        ExpiresAt = expiresAt,
        CreatedAt = now,
        UpdatedAt = now,
    };

    public void MarkExpired(DateTimeOffset now)
    {
        if (State != BillingPurchaseState.Active)
        {
            throw new InvalidOperationException($"Cannot expire a purchase in state {State}.");
        }

        State = BillingPurchaseState.Expired;
        UpdatedAt = now;
    }

    public void Revoke(DateTimeOffset now)
    {
        if (State != BillingPurchaseState.Active)
        {
            throw new InvalidOperationException($"Cannot revoke a purchase in state {State}.");
        }

        State = BillingPurchaseState.Revoked;
        UpdatedAt = now;
    }

    /// <summary>(Re-)activates the subscription, extending the expiry when the store grants more time.</summary>
    public void Activate(DateTimeOffset expiresAt, DateTimeOffset now)
    {
        State = BillingPurchaseState.Active;
        ExpiresAt = expiresAt > ExpiresAt ? expiresAt : ExpiresAt;
        UpdatedAt = now;
    }
}
