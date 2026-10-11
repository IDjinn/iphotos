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
            [FromQuery] int page = 0,
            [FromQuery] int pageSize = 0,
            CancellationToken cancellationToken = default) =>
        {
            // Paged when asked (doc 18 §9); the full array stays the default so
            // unpaged clients keep their contract.
            if (page > 0 && pageSize > 0)
            {
                return Results.Ok(await people.ListAsync(principal.GetUserId(), page, pageSize, cancellationToken));
            }

            return Results.Ok(await people.ListAsync(principal.GetUserId(), cancellationToken));
        })
        .WithName("ListPeople");

        group.MapGet("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            PersonService people,
            CancellationToken cancellationToken) =>
            Results.Ok(await people.GetAsync(principal.GetUserId(), id, cancellationToken)))
        .WithName("GetPerson");

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

        // Whole-group merge (doc 18 §7.4): the "same person?" review card folds
        // every member into the target in ONE atomic request — nothing half-merges.
        group.MapPost("/merge-batch", async (
            ClaimsPrincipal principal,
            MergeBatchRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.MergeManyAsync(principal.GetUserId(), request.TargetId, request.SourceIds, cancellationToken);
            return Results.NoContent();
        })
        .WithName("MergePeopleBatch");

        // "Same person?" review (doc 18 §7.4), split by destination: merges into
        // existing people and candidates for a new person. Dismissal is
        // client-side, keyed by the stable suggestion id.
        group.MapGet("/suggestions", async (
            ClaimsPrincipal principal,
            PersonService people,
            CancellationToken cancellationToken) =>
            Results.Ok(await people.SuggestAsync(principal.GetUserId(), cancellationToken)))
        .WithName("SuggestPeople");

        group.MapPost("/suggestions/accept", async (
            ClaimsPrincipal principal,
            AcceptSuggestionRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
            Results.Ok(await people.AcceptSuggestionAsync(principal.GetUserId(), request.FaceIds, cancellationToken)))
        .WithName("AcceptSuggestion");

        group.MapPost("/suggestions/merge", async (
            ClaimsPrincipal principal,
            AcceptMergeSuggestionRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.AcceptMergeSuggestionAsync(
                principal.GetUserId(), request.PersonId, request.FaceIds, cancellationToken);
            return Results.NoContent();
        })
        .WithName("AcceptMergeSuggestion");

        // One-by-one review verdicts (doc 18 §7.4): accepted faces join the
        // person; rejections/deferrals persist so the queue stops re-asking.
        group.MapPost("/suggestions/review", async (
            ClaimsPrincipal principal,
            ReviewSuggestionRequest request,
            PersonService people,
            CancellationToken cancellationToken) =>
        {
            await people.ReviewSuggestionAsync(
                principal.GetUserId(),
                request.PersonId,
                request.AcceptedFaceIds,
                request.RejectedFaceIds,
                request.UnsureFaceIds,
                cancellationToken);
            return Results.NoContent();
        })
        .WithName("ReviewSuggestion");

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
            HttpContext context,
            Guid id,
            ClaimsPrincipal principal,
            PersonService people,
            IFaceRepository faces,
            IBlobStorage blobs,
            CancellationToken cancellationToken) =>
        {
            var cropPath = await people.GetFaceCropAsync(principal.GetUserId(), id, faces, cancellationToken);
            var stream = await blobs.OpenReadAsync(cropPath, cancellationToken);
            // One crop per face id, never rewritten — the browser (and any client
            // cache) can keep it for the year without re-downloading.
            context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
            return Results.Stream(stream, "image/jpeg");
        })
        .WithTags("People")
        .RequireAuthorization()
        .WithName("GetFaceCrop");

        return app;
    }

    public sealed record RenamePersonRequest(string? Name);

    public sealed record MergePeopleRequest(Guid SourceId, Guid TargetId);

    public sealed record MergeBatchRequest(Guid TargetId, IReadOnlyList<Guid> SourceIds);

    public sealed record MoveFaceRequest(Guid FaceId, Guid? TargetPersonId);

    public sealed record AcceptSuggestionRequest(IReadOnlyList<Guid> FaceIds);

    public sealed record AcceptMergeSuggestionRequest(Guid PersonId, IReadOnlyList<Guid> FaceIds);

    public sealed record ReviewSuggestionRequest(
        Guid PersonId,
        IReadOnlyList<Guid> AcceptedFaceIds,
        IReadOnlyList<Guid> RejectedFaceIds,
        IReadOnlyList<Guid> UnsureFaceIds);
}
