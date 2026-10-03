namespace iPhotos.Application.Abstractions;

public enum BillingValidationState
{
    /// <summary>The store confirms a live subscription for this token.</summary>
    Valid,

    /// <summary>The token is unknown or malformed for this provider.</summary>
    Invalid,

    /// <summary>The purchase existed but its subscription term has ended.</summary>
    Expired,

    /// <summary>The purchase was refunded/cancelled by the store.</summary>
    Refunded,
}

public sealed record BillingValidation(BillingValidationState State, DateTimeOffset? ExpiresAt);

/// <summary>
/// Verifies purchase tokens against the external store (Google Play, Stripe, ...).
/// The backend never trusts a client purchase claim: plan/quota changes happen only
/// after <see cref="ValidatePurchaseAsync"/> confirms the token.
/// </summary>
public interface IBillingProvider
{
    /// <summary>Identifier stored on purchases made through this provider (e.g. "test", "google_play").</summary>
    string Name { get; }

    Task<BillingValidation> ValidatePurchaseAsync(string productId, string purchaseToken, CancellationToken cancellationToken = default);
}
