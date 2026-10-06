using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace iPhotos.Core.Endpoints;

/// <summary>
/// Account-wide preferences: the upload quality choice (original vs storage saver)
/// plus the count of stored photos that can be rewritten to match it.
/// </summary>
public static class UserPreferenceEndpoints
{
    public static IEndpointRouteBuilder MapUserPreferenceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/me/preferences").WithTags("Me").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            UserPreferencesService preferences,
            CancellationToken cancellationToken) =>
            Results.Ok(await preferences.GetAsync(principal.GetUserId(), cancellationToken)))
        .WithName("GetUserPreferences");

        group.MapPut("/", async (
            ClaimsPrincipal principal,
            UpdateUserPreferencesRequest request,
            UserPreferencesService preferences,
            CancellationToken cancellationToken) =>
            Results.Ok(await preferences.UpdateAsync(principal.GetUserId(), request, cancellationToken)))
        .WithName("UpdateUserPreferences");

        return app;
    }
}
