using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace iPhotos.Core.Endpoints;

public static class PeopleEndpoints
{
    public static IEndpointRouteBuilder MapPeopleEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/people").WithTags("People").RequireAuthorization();

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            PersonService people,
            CancellationToken cancellationToken) =>
            Results.Ok(await people.ListAsync(principal.GetUserId(), cancellationToken)))
        .WithName("ListPeople");

        group.MapGet("/{id:guid}/photos", async (
            Guid id,
            ClaimsPrincipal principal,
            PersonService people,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            CancellationToken cancellationToken = default) =>
            Results.Ok(await people.ListPhotosAsync(principal.GetUserId(), id, page, pageSize, cancellationToken)))
        .WithName("ListPersonPhotos");

        group.MapPatch("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            RenamePersonRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.RenameAsync(principal.GetUserId(), id, request.Name, cancellationToken);
            return Results.NoContent();
        })
        .WithName("RenamePerson");

        group.MapPost("/merge", async (
            ClaimsPrincipal principal,
            MergePeopleRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.MergeAsync(principal.GetUserId(), request.SourceId, request.TargetId, cancellationToken);
            return Results.NoContent();
        })
        .WithName("MergePeople");

        // targetPersonId null = start a new person with the moved face (split).
        group.MapPost("/{id:guid}/faces", async (
            Guid id,
            ClaimsPrincipal principal,
            MoveFaceRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.MoveFaceAsync(principal.GetUserId(), request.FaceId, request.TargetPersonId ?? id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("MoveFace");

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.DeleteAsync(principal.GetUserId(), id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeletePerson");

        // Face crops back the People row circles and merge chips; same access model
        // as photo files (owner-checked, immutable, cached aggressively).
        app.MapGet("/api/faces/{id:guid}/crop", async (
            Guid id,
            ClaimsPrincipal principal,
            PersonService people,
            IFaceRepository faces,
            IBlobStorage blobs,
            CancellationToken cancellationToken) =>
        {
            var cropPath = await people.GetFaceCropAsync(principal.GetUserId(), id, faces, cancellationToken);
            var stream = await blobs.OpenReadAsync(cropPath, cancellationToken);
            return Results.Stream(stream, "image/jpeg");
        })
        .WithTags("People")
        .RequireAuthorization()
        .WithName("GetFaceCrop");

        return app;
    }

    public sealed record RenamePersonRequest(string? Name);

    public sealed record MergePeopleRequest(Guid SourceId, Guid TargetId);

    public sealed record MoveFaceRequest(Guid FaceId, Guid? TargetPersonId);
}
