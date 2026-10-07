using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace iPhotos.Core.Endpoints;

public static class PhotoEndpoints
{
    public static IEndpointRouteBuilder MapPhotoEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/photos").WithTags("Photos").RequireAuthorization();

        group.MapPost("/", async (
            ClaimsPrincipal principal,
            IFormFile file,
            PhotoService photos,
            CancellationToken cancellationToken) =>
        {
            await using var stream = file.OpenReadStream();
            var result = await photos.UploadAsync(
                principal.GetUserId(), file.FileName, file.ContentType, stream, cancellationToken: cancellationToken);
            return result.Duplicated
                ? Results.Ok(result)
                : Results.Created($"/api/photos/{result.Photo.Id}", result);
        })
        .DisableAntiforgery()
        .WithName("UploadPhoto");

        // Direct-upload flow: reserve dedup/quota, then the client PUTs the bytes
        // straight to storage and confirms here. 501 = storage cannot presign;
        // the client falls back to the multipart endpoint above.
        group.MapPost("/upload-ticket", async (
            ClaimsPrincipal principal,
            UploadTicketRequest request,
            PhotoService photos,
            CancellationToken cancellationToken) =>
        {
            var ticket = await photos.CreateUploadTicketAsync(
                principal.GetUserId(), request.FileName, request.ContentType, request.SizeBytes, request.ContentHash, cancellationToken);
            return ticket.Duplicated
                ? Results.Ok(ticket)
                : Results.Created($"/api/photos/{ticket.Photo.Id}", ticket);
        })
        .DisableAntiforgery()
        .WithName("CreateUploadTicket");

        group.MapPost("/{id:guid}/complete", async (
            Guid id,
            ClaimsPrincipal principal,
            PhotoService photos,
            CompleteUploadRequest? request,
            CancellationToken cancellationToken) =>
            Results.Ok(await photos.CompleteUploadAsync(principal.GetUserId(), id, request, cancellationToken)))
        .DisableAntiforgery()
        .WithName("CompleteUpload");

        // Oversize direct uploads ride a multipart session: the client presigns each
        // part through here and PUTs the bytes straight to storage. 501 = storage
        // cannot presign multipart; the client falls back to the proxied upload.
        group.MapPost("/{id:guid}/part-url", async (
            Guid id,
            ClaimsPrincipal principal,
            PartUrlRequest request,
            PhotoService photos,
            CancellationToken cancellationToken) =>
        {
            var url = await photos.CreatePartUrlAsync(principal.GetUserId(), id, request.PartNumber, cancellationToken);
            return url is null
                ? Results.Json(new { error = "Direct multipart upload is not available.", code = ErrorCodes.PhotosMultipartUnavailable },
                    statusCode: StatusCodes.Status501NotImplemented)
                : Results.Ok(new PartUrlResponse(url.Url, request.PartNumber, url.ExpiresAt));
        })
        .DisableAntiforgery()
        .WithName("CreatePartUrl");

        group.MapPost("/{id:guid}/abort", async (
            Guid id,
            ClaimsPrincipal principal,
            PhotoService photos,
            CancellationToken cancellationToken) =>
        {
            await photos.AbortUploadAsync(principal.GetUserId(), id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("AbortUpload");

        group.MapGet("/", async (
            ClaimsPrincipal principal,
            PhotoService photos,
            [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to,
            [FromQuery] string? fileName,
            [FromQuery] string? camera,
            [FromQuery] string? mediaType,
            [FromQuery] string? sortBy,
            [FromQuery] string? order,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            CancellationToken cancellationToken = default) =>
        {
            // Query binding for enums is case-sensitive; parse by hand so clients can
            // send the camelCase values the API serializes ("video", "photo").
            MediaType? parsedMediaType = null;
            if (!string.IsNullOrWhiteSpace(mediaType))
            {
                if (!Enum.TryParse(mediaType, ignoreCase: true, out MediaType parsed)
                    || !Enum.IsDefined(parsed))
                {
                    return Results.BadRequest(new
                    {
                        error = $"Unknown media type '{mediaType}'. Use 'photo' or 'video'.",
                        code = ErrorCodes.PhotosInvalidMediaType,
                    });
                }

                parsedMediaType = parsed;
            }

            // Normalize to the canonical camelCase values the repository switches on.
            sortBy = sortBy?.Trim().ToLowerInvariant() switch
            {
                null or "" => "takenAt",
                "takenat" => "takenAt",
                "createdat" => "createdAt",
                var other => other,
            };
            if (sortBy is not ("takenAt" or "createdAt"))
            {
                return Results.BadRequest(new
                {
                    error = $"Unknown sort field '{sortBy}'. Use 'takenAt' or 'createdAt'.",
                    code = ErrorCodes.PhotosInvalidSort,
                });
            }

            order = string.IsNullOrWhiteSpace(order) ? "desc" : order.Trim().ToLowerInvariant();
            if (order is not ("asc" or "desc"))
            {
                return Results.BadRequest(new { error = $"Unknown order '{order}'. Use 'asc' or 'desc'.", code = ErrorCodes.PhotosInvalidOrder });
            }

            var filter = new PhotoFilter(
                principal.GetUserId(), from, to, fileName, camera, page, pageSize, parsedMediaType, sortBy, order);
            return Results.Ok(await photos.ListAsync(principal.GetUserId(), filter, cancellationToken));
        });

        group.MapGet("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            PhotoService photos,
            CancellationToken cancellationToken) =>
            Results.Ok(await photos.GetAsync(principal.GetUserId(), id, cancellationToken)));

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            PhotoService photos,
            CancellationToken cancellationToken) =>
        {
            await photos.DeleteAsync(principal.GetUserId(), id, cancellationToken);
            return Results.NoContent();
        });

        group.MapGet("/{id:guid}/files/{kind}", async (
            Guid id,
            string kind,
            ClaimsPrincipal principal,
            HttpRequest request,
            HttpResponse response,
            PhotoService photos,
            IBlobStorage blobs,
            CancellationToken cancellationToken) =>
        {
            if (!Enum.TryParse<VariantKind>(kind, ignoreCase: true, out var variantKind))
            {
                return Results.BadRequest(new
                {
                    error = $"Unknown variant '{kind}'. Use original, preview or thumbnail.",
                    code = ErrorCodes.PhotosInvalidVariant,
                });
            }

            var file = await photos.GetVariantFileAsync(principal.GetUserId(), id, variantKind, cancellationToken);

            // Variant blobs are immutable once written (uploads are content-addressed and
            // variants are generated a single time), so clients may cache aggressively and
            // revalidate: a matching If-None-Match short-circuits before any storage hop.
            var etagValue = $"\"{file.ContentHash}-{variantKind.ToString().ToLowerInvariant()}\"";
            var etag = EntityTagHeaderValue.Parse(etagValue);
            response.Headers.CacheControl = "private, max-age=31536000, immutable";
            if (request.Headers.IfNoneMatch.Any(candidate =>
                    EntityTagHeaderValue.TryParse(candidate, out var parsed)
                    && parsed.Compare(etag, useStrongComparison: true)))
            {
                response.Headers.ETag = etagValue;
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }

            var stream = await blobs.OpenReadAsync(file.BlobPath, cancellationToken);
            return Results.Stream(stream, file.ContentType, entityTag: etag, enableRangeProcessing: true);
        });

        app.MapGet("/api/usage", async (
            ClaimsPrincipal principal,
            PhotoService photos,
            CancellationToken cancellationToken) =>
            Results.Ok(await photos.GetUsageAsync(principal.GetUserId(), cancellationToken)))
            .WithTags("Photos")
            .RequireAuthorization();

        return app;
    }
}
