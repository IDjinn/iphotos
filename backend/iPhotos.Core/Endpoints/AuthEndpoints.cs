using System.Security.Claims;
using iPhotos.Application.Common;
using iPhotos.Application;
using iPhotos.Application.Services;

namespace iPhotos.Core.Endpoints;

public sealed record RefreshRequest(string RefreshToken);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth").RequireRateLimiting("auth");

        group.MapPost("/register", async (RegisterRequest request, AuthService auth) =>
        {
            var result = await auth.RegisterAsync(request);
            return Results.Created($"/api/users/{result.UserId}", result);
        });

        group.MapPost("/login", async (LoginRequest request, AuthService auth) =>
            Results.Ok(await auth.LoginAsync(request)));

        group.MapPost("/refresh", async (RefreshRequest request, AuthService auth) =>
            Results.Ok(await auth.RefreshAsync(request.RefreshToken)));

        group.MapPost("/logout", async (RefreshRequest request, AuthService auth) =>
        {
            await auth.LogoutAsync(request.RefreshToken);
            return Results.NoContent();
        }).RequireAuthorization();

        return app;
    }

    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        Guid.TryParse(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub"),
            out var id)
            ? id
            : throw new UnauthorizedException("The access token has no user id.");
}
