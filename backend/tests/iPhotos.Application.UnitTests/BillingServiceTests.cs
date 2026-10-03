using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.UnitTests;

public class BillingServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private const string ProductId = "iphotos.cloud.1tb.monthly";
    private const long TbQuota = 1L << 40;
    private const long FreeQuota = 15L * 1024 * 1024 * 1024;

    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryBillingPurchaseRepository _purchases = new();
    private readonly FakeBillingProvider _provider = new();
    private readonly FakeUnitOfWork _uow = new();

    private BillingService NewService()
    {
        var options = new BillingOptions
        {
            Provider = "fake",
            GracePeriodDays = 3,
            Products =
            {
                [ProductId] = new BillingProductOptions
                {
                    DisplayName = "iPhotos Cloud 1 TB",
                    DisplayPrice = "$15/month",
                    QuotaBytes = TbQuota,
                },
            },
        };
        var storage = new StorageOptions { DefaultQuotaBytes = FreeQuota };
        return new BillingService(
            _purchases, _users, _provider, _uow,
            new StubDateTimeProvider(Now), Options.Create(options), Options.Create(storage));
    }

    private BillingExpiryHandler NewExpiryHandler(int graceDays = 3)
    {
        var options = new BillingOptions { GracePeriodDays = graceDays };
        var storage = new StorageOptions { DefaultQuotaBytes = FreeQuota };
        return new BillingExpiryHandler(
            _purchases, _users, _uow, new StubDateTimeProvider(Now),
            Options.Create(options), Options.Create(storage),
            NullLogger<BillingExpiryHandler>.Instance);
    }

    private User NewUser(long quota = FreeQuota)
    {
        var user = User.Create($"user-{Guid.NewGuid():N}@example.com", "hash", null, quota, Now);
        _users.Users.Add(user);
        return user;
    }

    private BillingPurchase AddPurchase(User user, DateTimeOffset expiresAt, BillingPurchaseState state = BillingPurchaseState.Active)
    {
        var purchase = BillingPurchase.Create(
            user.Id, "fake", ProductId, $"token-{Guid.NewGuid():N}", TbQuota, expiresAt, Now);
        if (state == BillingPurchaseState.Expired)
        {
            purchase.MarkExpired(Now);
        }
        else if (state == BillingPurchaseState.Revoked)
        {
            purchase.Revoke(Now);
        }

        _purchases.Purchases.Add(purchase);
        return purchase;
    }

    [Fact]
    public async Task Verify_ValidToken_ActivatesPlanAndQuota()
    {
        var user = NewUser();
        _provider.Result = new BillingValidation(BillingValidationState.Valid, Now.AddDays(30));

        var status = await NewService().VerifyPurchaseAsync(user.Id, ProductId, "store-token-1");

        status.State.ShouldBe(BillingSubscriptionState.Active);
        status.Plan.ShouldBe(ProductId);
        status.QuotaBytes.ShouldBe(TbQuota);
        status.ExpiresAt.ShouldBe(Now.AddDays(30));

        user.Plan.ShouldBe(ProductId);
        user.StorageQuotaBytes.ShouldBe(TbQuota);

        var purchase = _purchases.Purchases.ShouldHaveSingleItem();
        purchase.UserId.ShouldBe(user.Id);
        purchase.State.ShouldBe(BillingPurchaseState.Active);
        purchase.QuotaBytes.ShouldBe(TbQuota);
        purchase.Provider.ShouldBe("fake");
    }

    [Fact]
    public async Task Verify_InvalidToken_ThrowsAndKeepsFreePlan()
    {
        var user = NewUser();
        _provider.Result = new BillingValidation(BillingValidationState.Invalid, null);

        var service = NewService();
        await Should.ThrowAsync<InvalidPurchaseException>(
            () => service.VerifyPurchaseAsync(user.Id, ProductId, "forged-token"));

        _purchases.Purchases.ShouldBeEmpty();
        user.Plan.ShouldBe("free");
        user.StorageQuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Verify_UnknownProduct_ThrowsValidation()
    {
        var user = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().VerifyPurchaseAsync(user.Id, "iphotos.nope", "store-token-1"));

        _provider.ValidationCount.ShouldBe(0);
    }

    [Fact]
    public async Task Verify_SameTokenTwice_IsIdempotent()
    {
        var user = NewUser();
        _provider.Result = new BillingValidation(BillingValidationState.Valid, Now.AddDays(30));

        var service = NewService();
        await service.VerifyPurchaseAsync(user.Id, ProductId, "store-token-1");
        var second = await service.VerifyPurchaseAsync(user.Id, ProductId, "store-token-1");

        _purchases.Purchases.ShouldHaveSingleItem();
        _provider.ValidationCount.ShouldBe(1);
        second.State.ShouldBe(BillingSubscriptionState.Active);
    }

    [Fact]
    public async Task Verify_TokenLinkedToOtherUser_Throws()
    {
        var owner = NewUser();
        var attacker = NewUser();
        _provider.Result = new BillingValidation(BillingValidationState.Valid, Now.AddDays(30));

        var service = NewService();
        await service.VerifyPurchaseAsync(owner.Id, ProductId, "store-token-1");

        await Should.ThrowAsync<InvalidPurchaseException>(
            () => service.VerifyPurchaseAsync(attacker.Id, ProductId, "store-token-1"));

        // Attacker's plan is untouched.
        attacker.Plan.ShouldBe("free");
        attacker.StorageQuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Verify_ExpiredValidation_Throws()
    {
        var user = NewUser();
        _provider.Result = new BillingValidation(BillingValidationState.Expired, null);

        await Should.ThrowAsync<InvalidPurchaseException>(
            () => NewService().VerifyPurchaseAsync(user.Id, ProductId, "store-token-1"));

        _purchases.Purchases.ShouldBeEmpty();
    }

    [Fact]
    public async Task Status_NoPurchases_ReturnsFree()
    {
        var user = NewUser();

        var status = await NewService().GetStatusAsync(user.Id);

        status.State.ShouldBe(BillingSubscriptionState.Free);
        status.Plan.ShouldBe("free");
        status.QuotaBytes.ShouldBe(FreeQuota);
        status.ExpiresAt.ShouldBeNull();
    }

    [Fact]
    public async Task Status_TermEndedWithinGrace_ReturnsGrace()
    {
        var user = NewUser();
        AddPurchase(user, Now.AddDays(-1));

        var status = await NewService().GetStatusAsync(user.Id);

        status.State.ShouldBe(BillingSubscriptionState.Grace);
        status.Plan.ShouldBe(ProductId);
        status.QuotaBytes.ShouldBe(TbQuota);
    }

    [Fact]
    public async Task Status_TermEndedPastGrace_ReturnsExpired()
    {
        var user = NewUser();
        AddPurchase(user, Now.AddDays(-4));

        var status = await NewService().GetStatusAsync(user.Id);

        status.State.ShouldBe(BillingSubscriptionState.Expired);
        status.QuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Status_SweptExpiredPurchase_StillReportsExpiredWithFreeQuota()
    {
        var user = NewUser();
        var purchase = AddPurchase(user, Now.AddDays(-30));
        purchase.MarkExpired(Now);

        var status = await NewService().GetStatusAsync(user.Id);

        status.State.ShouldBe(BillingSubscriptionState.Expired);
        status.QuotaBytes.ShouldBe(FreeQuota);
        status.ExpiresAt.ShouldBe(Now.AddDays(-30));
    }

    [Fact]
    public async Task Status_RevokedPurchase_ReportsFree()
    {
        var user = NewUser();
        var purchase = AddPurchase(user, Now.AddDays(20));
        purchase.Revoke(Now);

        var status = await NewService().GetStatusAsync(user.Id);

        status.State.ShouldBe(BillingSubscriptionState.Free);
    }

    [Fact]
    public async Task Status_UnknownUser_Throws()
    {
        await Should.ThrowAsync<NotFoundException>(
            () => NewService().GetStatusAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task Expire_LapsedPurchase_DowngradesUserToFreeQuota()
    {
        var user = NewUser(quota: TbQuota);
        user.Plan = ProductId;
        AddPurchase(user, Now.AddDays(-4));

        var expired = await NewExpiryHandler().ExpireLapsedPurchasesAsync();

        expired.ShouldBe(1);
        _purchases.Purchases.Single().State.ShouldBe(BillingPurchaseState.Expired);
        user.Plan.ShouldBe("free");
        user.StorageQuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Expire_GraceNotPassed_KeepsSubscriptionActive()
    {
        var user = NewUser(quota: TbQuota);
        user.Plan = ProductId;
        AddPurchase(user, Now.AddDays(-1));

        var expired = await NewExpiryHandler().ExpireLapsedPurchasesAsync();

        expired.ShouldBe(0);
        _purchases.Purchases.Single().State.ShouldBe(BillingPurchaseState.Active);
        user.Plan.ShouldBe(ProductId);
    }

    [Fact]
    public async Task Expire_UserWithSecondActivePurchase_KeepsPlan()
    {
        var user = NewUser(quota: TbQuota);
        user.Plan = ProductId;
        AddPurchase(user, Now.AddDays(-30));
        AddPurchase(user, Now.AddDays(30));

        var expired = await NewExpiryHandler().ExpireLapsedPurchasesAsync();

        expired.ShouldBe(1);
        _purchases.Purchases.Count.ShouldBe(2);
        user.Plan.ShouldBe(ProductId);
        user.StorageQuotaBytes.ShouldBe(TbQuota);
    }

    [Fact]
    public async Task Restore_UnknownToken_ThrowsNotFound()
    {
        var user = NewUser();

        await Should.ThrowAsync<NotFoundException>(
            () => NewService().RestorePurchaseAsync(user.Id, "missing-token"));
    }

    [Fact]
    public async Task Restore_ExpiredPurchaseWithValidStoreToken_Reactivates()
    {
        var user = NewUser();
        var purchase = AddPurchase(user, Now.AddDays(-30));
        purchase.MarkExpired(Now);
        _provider.Result = new BillingValidation(BillingValidationState.Valid, Now.AddDays(30));

        var status = await NewService().RestorePurchaseAsync(user.Id, purchase.PurchaseToken);

        status.State.ShouldBe(BillingSubscriptionState.Active);
        purchase.State.ShouldBe(BillingPurchaseState.Active);
        user.Plan.ShouldBe(ProductId);
        user.StorageQuotaBytes.ShouldBe(TbQuota);
    }

    [Fact]
    public async Task Restore_RefundedActivePurchase_RevokesAndDowngrades()
    {
        var user = NewUser();
        var purchase = AddPurchase(user, Now.AddDays(20));
        _provider.Result = new BillingValidation(BillingValidationState.Refunded, null);

        var status = await NewService().RestorePurchaseAsync(user.Id, purchase.PurchaseToken);

        status.State.ShouldBe(BillingSubscriptionState.Free);
        purchase.State.ShouldBe(BillingPurchaseState.Revoked);
        user.Plan.ShouldBe("free");
        user.StorageQuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Products_ReturnsCatalogSortedByQuota()
    {
        var response = await NewService().GetProductsAsync();

        response.Products.ShouldHaveSingleItem();
        var product = response.Products.Single();
        product.ProductId.ShouldBe(ProductId);
        product.DisplayName.ShouldBe("iPhotos Cloud 1 TB");
        product.DisplayPrice.ShouldBe("$15/month");
        product.QuotaBytes.ShouldBe(TbQuota);
    }
}
