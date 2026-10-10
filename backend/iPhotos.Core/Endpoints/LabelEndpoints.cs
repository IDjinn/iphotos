using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.AspNetCore.Mvc;

namespace iPhotos.Core.Endpoints;

public static class LabelEndpoints
{
    public static IEndpointRouteBuilder MapLabelEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/labels").WithTags("Labels").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            LabelService labels,
            [FromQuery] int limit = 100,
            CancellationToken cancellationToken = default) =>
            Results.Ok(await labels.ListTopAsync(principal.GetUserId(), limit, cancellationToken)))
        .WithName("ListLabels");

        group.MapGet("/{label}/photos", async (
            string label,
            ClaimsPrincipal principal,
            LabelService labels,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            CancellationToken cancellationToken = default) =>
            Results.Ok(await labels.ListPhotosAsync(principal.GetUserId(), label, page, pageSize, cancellationToken)))
        .WithName("ListLabelPhotos");

        app.MapGet("/api/photos/{id:guid}/labels", async (
            Guid id,
            ClaimsPrincipal principal,
            LabelService labels,
            CancellationToken cancellationToken) =>
            Results.Ok((await labels.ListForPhotoAsync(principal.GetUserId(), id, cancellationToken))
                .Select(l => new PhotoLabelDto(l.PhotoId, l.Label, l.Score))))
        .WithTags("Labels")
        .RequireAuthorization()
        .WithName("ListPhotoLabels");

        return app;
    }
}
