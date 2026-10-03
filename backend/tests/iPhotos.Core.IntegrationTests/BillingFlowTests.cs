using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using iPhotos.Application;
using iPhotos.Application.Services;
using iPhotos.Domain;
using iPhotos.Infrastructure;
using iPhotos.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace iPhotos.Core.IntegrationTests;

/// <summary>
/// End-to-end billing flow against the real API + PostgreSQL: catalog, sandbox
/// verification, quota application and the expiry sweep downgrade.
/// </summary>
public sealed class BillingFlowTests : IClassFixture<iPhotosApiFactory>
{
    private const string ProductId = "iphotos.cloud.1tb.monthly";
    private const long TbQuota = 1L << 40;
    private const long FreeQuota = 15L * 1024 * 1024 * 1024;

    private readonly iPhotosApiFactory _factory;

    public BillingFlowTests(iPhotosApiFactory factory) => _factory = factory;

    private async Task<HttpClient> NewAuthorizedClientAsync()
    {
        var client = _factory.CreateClient();
        var email = $"billing-{Guid.NewGuid():N}@example.com";
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "password123",
        }, JsonOptions.Web);
        register.StatusCode.ShouldBe(HttpStatusCode.Created);
        var auth = await register.Content.ReadFromJsonAsync<AuthResult>(JsonOptions.Web);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth!.Tokens.AccessToken);
        return client;
    }

    private async Task<BillingStatusDto> GetStatusAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/billing/status");
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<BillingStatusDto>(JsonOptions.Web))!;
    }

    [Fact]
    public async Task Products_ExposesSandboxCatalog()
    {
        using var client = await NewAuthorizedClientAsync();

        var response = await client.GetAsync("/api/billing/products");

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var catalog = (await response.Content.ReadFromJsonAsync<BillingProductsResponse>(JsonOptions.Web))!;
        catalog.Sandbox.ShouldBeTrue();
        var product = catalog.Products.ShouldHaveSingleItem();
        product.ProductId.ShouldBe(ProductId);
        product.QuotaBytes.ShouldBe(TbQuota);
        product.DisplayPrice.ShouldBe("$15/month");
    }

    [Fact]
    public async Task Verify_ForgedToken_IsRejectedWithoutPlanChange()
    {
        using var client = await NewAuthorizedClientAsync();

        var response = await client.PostAsJsonAsync("/api/billing/verify", new
        {
            productId = ProductId,
            purchaseToken = "forged-by-client",
        }, JsonOptions.Web);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions.Web);
        body.GetProperty("error").GetString().ShouldNotBeNullOrWhiteSpace();

        var status = await GetStatusAsync(client);
        status.State.ShouldBe(BillingSubscriptionState.Free);
        status.QuotaBytes.ShouldBe(FreeQuota);
    }

    [Fact]
    public async Task Verify_TokenAlreadyLinkedToOtherAccount_IsRejected()
    {
        using var owner = await NewAuthorizedClientAsync();
        var verify = await owner.PostAsJsonAsync("/api/billing/verify", new
        {
            productId = ProductId,
            purchaseToken = "test_shared-token",
        }, JsonOptions.Web);
        verify.StatusCode.ShouldBe(HttpStatusCode.OK);

        using var attacker = await NewAuthorizedClientAsync();
        var reuse = await attacker.PostAsJsonAsync("/api/billing/verify", new
        {
            productId = ProductId,
            purchaseToken = "test_shared-token",
        }, JsonOptions.Web);

        reuse.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var status = await GetStatusAsync(attacker);
        status.State.ShouldBe(BillingSubscriptionState.Free);
    }

    [Fact]
    public async Task Verify_SandboxToken_ActivatesQuota_ThenExpirySweepDowngrades()
    {
        using var client = await NewAuthorizedClientAsync();

        // Free before any purchase.
        var before = await GetStatusAsync(client);
        before.State.ShouldBe(BillingSubscriptionState.Free);

        var verify = await client.PostAsJsonAsync("/api/billing/verify", new
        {
            productId = ProductId,
            purchaseToken = "test_active-subscription",
        }, JsonOptions.Web);
        verify.StatusCode.ShouldBe(HttpStatusCode.OK);

        var active = (await verify.Content.ReadFromJsonAsync<BillingStatusDto>(JsonOptions.Web))!;
        active.State.ShouldBe(BillingSubscriptionState.Active);
        active.Plan.ShouldBe(ProductId);
        active.QuotaBytes.ShouldBe(TbQuota);
        active.ExpiresAt.ShouldNotBeNull();

        // The quota change is visible through the regular usage endpoint.
        var usage = await client.GetAsync("/api/usage");
        usage.StatusCode.ShouldBe(HttpStatusCode.OK);
        var usageBody = await usage.Content.ReadFromJsonAsync<UsageSummary>(JsonOptions.Web);
        usageBody!.QuotaBytes.ShouldBe(TbQuota);

        // Backdate the purchase past its grace period, then run the sweep the worker
        // would run, and confirm the downgrade (photos are never touched).
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PhotosDbContext>();
            var purchase = await db.BillingPurchases.SingleAsync(p => p.PurchaseToken == "test_active-subscription");
            purchase.ExpiresAt = DateTimeOffset.UtcNow.AddDays(-10);
            await db.SaveChangesAsync();

            var handler = scope.ServiceProvider.GetRequiredService<BillingExpiryHandler>();
            (await handler.ExpireLapsedPurchasesAsync()).ShouldBe(1);
        }

        var after = await GetStatusAsync(client);
        after.State.ShouldBe(BillingSubscriptionState.Expired);
        after.Plan.ShouldBe("free");
        after.ExpiresAt.ShouldNotBeNull();

        var usageAfter = await client.GetAsync("/api/usage");
        var usageAfterBody = await usageAfter.Content.ReadFromJsonAsync<UsageSummary>(JsonOptions.Web);
        usageAfterBody!.QuotaBytes.ShouldBe(FreeQuota);

        // Uploads within the free quota still work after the downgrade.
        var upload = await client.PostAsync("/api/photos", Multipart("after-downgrade.jpg", TinyJpeg()));
        upload.StatusCode.ShouldBe(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Restore_SandboxToken_KeepsActiveSubscription()
    {
        using var client = await NewAuthorizedClientAsync();
        await client.PostAsJsonAsync("/api/billing/verify", new
        {
            productId = ProductId,
            purchaseToken = "test_restore-me",
        }, JsonOptions.Web);

        var restore = await client.PostAsJsonAsync("/api/billing/restore", new
        {
            purchaseToken = "test_restore-me",
        }, JsonOptions.Web);

        restore.StatusCode.ShouldBe(HttpStatusCode.OK);
        var status = (await restore.Content.ReadFromJsonAsync<BillingStatusDto>(JsonOptions.Web))!;
        status.State.ShouldBe(BillingSubscriptionState.Active);
        status.QuotaBytes.ShouldBe(TbQuota);
    }

    private static byte[] TinyJpeg()
    {
        using var image = new Image<Rgba32>(8, 8);
        using var output = new MemoryStream();
        image.SaveAsJpeg(output);
        return output.ToArray();
    }

    private static MultipartFormDataContent Multipart(string fileName, byte[] bytes)
    {
        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
        form.Add(fileContent, "file", fileName);
        return form;
    }
}
