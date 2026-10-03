using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace iPhotos.Core.Endpoints;

public static class BillingEndpoints
{
    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/billing").WithTags("Billing").RequireAuthorization();

        group.MapGet("/products", async (BillingService billing, CancellationToken cancellationToken) =>
            {
                var response = await billing.GetProductsAsync(cancellationToken);
                return Results.Ok(response);
            })
            .WithName("GetBillingProducts");

        group.MapPost("/verify", async (
                ClaimsPrincipal principal,
                VerifyPurchaseRequest request,
                BillingService billing,
                CancellationToken cancellationToken) =>
            {
                var status = await billing.VerifyPurchaseAsync(
                    principal.GetUserId(), request.ProductId, request.PurchaseToken, cancellationToken);
                return Results.Ok(status);
            })
            .RequireRateLimiting("auth")
            .WithName("VerifyPurchase");

        group.MapGet("/status", async (
                ClaimsPrincipal principal,
                BillingService billing,
                CancellationToken cancellationToken) =>
            {
                var status = await billing.GetStatusAsync(principal.GetUserId(), cancellationToken);
                return Results.Ok(status);
            })
            .WithName("GetBillingStatus");

        group.MapPost("/restore", async (
                ClaimsPrincipal principal,
                RestorePurchaseRequest request,
                BillingService billing,
                CancellationToken cancellationToken) =>
            {
                var status = await billing.RestorePurchaseAsync(
                    principal.GetUserId(), request.PurchaseToken, cancellationToken);
                return Results.Ok(status);
            })
            .RequireRateLimiting("auth")
            .WithName("RestorePurchase");

        return app;
    }
}
