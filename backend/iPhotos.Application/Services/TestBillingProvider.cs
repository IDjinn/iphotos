using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Development/sandbox provider: accepts tokens with the configured prefix and grants
/// a fixed subscription length (no real money). Replaced by GooglePlayBillingProvider
/// or a Stripe provider later without touching the domain, endpoints or app.
/// </summary>
public sealed class TestBillingProvider(IOptions<TestBillingOptions> optionsAccessor, IDateTimeProvider dateTime)
    : IBillingProvider
{
    public string Name => "test";

    public Task<BillingValidation> ValidatePurchaseAsync(
        string productId, string purchaseToken, CancellationToken cancellationToken = default)
    {
        var options = optionsAccessor.Value;
        if (string.IsNullOrWhiteSpace(purchaseToken)
            || !purchaseToken.StartsWith(options.TokenPrefix, StringComparison.Ordinal))
        {
            return Task.FromResult(new BillingValidation(BillingValidationState.Invalid, null));
        }

        var expiresAt = dateTime.UtcNow.AddDays(Math.Max(1, options.DurationDays));
        return Task.FromResult(new BillingValidation(BillingValidationState.Valid, expiresAt));
    }
}
