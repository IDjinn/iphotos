using System.Diagnostics;
using iPhotos.Storage;

namespace iPhotos.Storage.Host;

public static class ObjectEndpoints
{
    public static void MapObjectEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/objects");

        group.MapPut("/{**key}", PutAsync);
        group.MapGet("/{**key}", GetAsync);
        group.MapMethods("/{**key}", ["HEAD"], GetAsync);
        group.MapDelete("/{**key}", DeleteAsync);

        // Catch-all routes must end the template, so the url endpoints hang off /api/objects
        // directly: POST /api/objects/url?key=...&provider=...&expirySeconds=... (GET URL) and
        // POST /api/objects/upload-url?key=...&provider=...&contentType=... (presigned PUT URL).
        app.MapPost("/api/objects/url", CreateUrlAsync);
        app.MapPost("/api/objects/upload-url", CreateUploadUrlAsync);

        // Direct multipart sessions (providers that presign): create → per-part presigned
        // PUTs → complete (or abort). All API-key protected like every object route.
        app.MapPost("/api/objects/multipart", CreateMultipartAsync);
        app.MapPost("/api/objects/multipart/{uploadId}/part-url", CreatePartUrlAsync);
        app.MapPost("/api/objects/multipart/{uploadId}/complete", CompleteMultipartAsync);
        app.MapDelete("/api/objects/multipart/{uploadId}", AbortMultipartAsync);
    }

    private static async Task<IResult> PutAsync(
        HttpContext context, string key, string? provider, IObjectStoreFactoryAccessor accessor, ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        var started = Stopwatch.GetTimestamp();
        await using var body = context.Request.Body;
        var result = await store.PutAsync(normalized, body, context.Request.ContentType, context.RequestAborted);
        logger.LogInformation(
            "PUT  {Provider}:{Key} {Size} ({Elapsed}ms)",
            store.Id, normalized, ByteSize.Format(result.SizeBytes), Stopwatch.GetElapsedTime(started).TotalMilliseconds);

        var expiresAt = accessor.Now + accessor.Options.UrlExpiry;
        var url = await BuildGetUrlAsync(context, accessor, store, normalized, expiresAt);
        return Results.Json(
            new ObjectUrlResponse(url, normalized, store.Id, result.SizeBytes, context.Request.ContentType, expiresAt),
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetAsync(
        HttpContext context, string key, string? provider, long? exp, string? sig,
        IObjectStoreFactoryAccessor accessor, ILogger<Program> logger)
    {
        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);

        // Either the service API key (header) or a valid signature (capability URL) grants access.
        var authorized = accessor.IsApiKeyValid(context)
            || accessor.IsSignatureValid(context, "GET", store.Id, normalized, exp, sig);
        if (!authorized)
        {
            return Unauthorized();
        }

        var started = Stopwatch.GetTimestamp();

        // HEAD short-circuits before opening any stream.
        if (HttpMethods.IsHead(context.Request.Method))
        {
            var head = await store.HeadAsync(normalized, context.RequestAborted);
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentLength = head.SizeBytes;
            if (head.ETag is not null)
            {
                context.Response.Headers.ETag = head.ETag;
            }

            logger.LogInformation(
                "HEAD {Provider}:{Key} {Size} ({Elapsed}ms)",
                store.Id, normalized, ByteSize.Format(head.SizeBytes ?? 0), Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            return Results.Empty;
        }

        if (accessor.Options.RedirectToPresigned && store.CanPresign)
        {
            var presigned = await store.TryPresignGetAsync(normalized, accessor.Options.UrlExpiry, context.RequestAborted);
            if (presigned is not null)
            {
                logger.LogInformation(
                    "GET  {Provider}:{Key} → presigned redirect ({Elapsed}ms)",
                    store.Id, normalized, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
                return Results.Redirect(presigned, permanent: false, preserveMethod: false);
            }
        }

        var read = await store.OpenReadAsync(normalized, context.RequestAborted);
        logger.LogInformation(
            "GET  {Provider}:{Key} {ContentType} ({Elapsed}ms)",
            store.Id, normalized, read.ContentType ?? "application/octet-stream",
            Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        return Results.Stream(read.Content, read.ContentType ?? "application/octet-stream", enableRangeProcessing: true);
    }

    private static async Task<IResult> DeleteAsync(
        HttpContext context, string key, string? provider, IObjectStoreFactoryAccessor accessor, ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        await store.DeleteAsync(normalized, context.RequestAborted);
        logger.LogInformation("DELETE {Provider}:{Key}", store.Id, normalized);
        return Results.NoContent();
    }

    private static async Task<IResult> CreateUrlAsync(HttpContext context, string? key, string? provider, long? expirySeconds, IObjectStoreFactoryAccessor accessor)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Results.Json(new { error = "Query parameter 'key' is required.", code = StorageErrorCodes.KeyRequired }, statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        await store.HeadAsync(normalized, context.RequestAborted); // 404 when missing

        var maxExpiry = (long)TimeSpan.FromDays(365).TotalSeconds;
        var expiry = expirySeconds is > 0 && expirySeconds <= maxExpiry
            ? TimeSpan.FromSeconds(expirySeconds.Value)
            : accessor.Options.UrlExpiry;
        var expiresAt = accessor.Now + expiry;
        var url = await BuildGetUrlAsync(context, accessor, store, normalized, expiresAt);
        return Results.Ok(new ObjectUrlResponse(url, normalized, store.Id, null, null, expiresAt));
    }

    private static async Task<IResult> CreateUploadUrlAsync(
        HttpContext context,
        string? key,
        string? provider,
        string? contentType,
        long? expirySeconds,
        IObjectStoreFactoryAccessor accessor,
        ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Results.Json(new { error = "Query parameter 'key' is required.", code = StorageErrorCodes.KeyRequired }, statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        var maxExpiry = (long)TimeSpan.FromDays(365).TotalSeconds;
        var expiry = expirySeconds is > 0 && expirySeconds <= maxExpiry
            ? TimeSpan.FromSeconds(expirySeconds.Value)
            : accessor.Options.UploadUrlExpiry;
        var expiresAt = accessor.Now + expiry;
        var url = store.CanPresign
            ? await store.TryPresignPutAsync(normalized, expiry, contentType, context.RequestAborted)
            : null;
        if (url is null)
        {
            return Results.Json(
                new { error = $"Provider '{store.Id}' cannot presign direct uploads.", code = StorageErrorCodes.PresignUnsupported },
                statusCode: StatusCodes.Status501NotImplemented);
        }

        logger.LogInformation(
            "PRESIGN PUT {Provider}:{Key} (expires {ExpiresAt:O})",
            store.Id, normalized, expiresAt);
        return Results.Ok(new ObjectUrlResponse(url, normalized, store.Id, null, contentType, expiresAt));
    }

    private static async Task<IResult> CreateMultipartAsync(
        HttpContext context,
        string? key,
        string? provider,
        string? contentType,
        IObjectStoreFactoryAccessor accessor,
        ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Results.Json(new { error = "Query parameter 'key' is required.", code = StorageErrorCodes.KeyRequired }, statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        var uploadId = await store.TryCreateMultipartUploadAsync(normalized, contentType, context.RequestAborted);
        if (uploadId is null)
        {
            return Results.Json(
                new { error = $"Provider '{store.Id}' cannot presign multipart uploads.", code = StorageErrorCodes.PresignUnsupported },
                statusCode: StatusCodes.Status501NotImplemented);
        }

        logger.LogInformation("PRESIGN MULTIPART CREATE {Provider}:{Key}", store.Id, normalized);
        return Results.Ok(new MultipartCreateResponse(uploadId, normalized, store.Id));
    }

    private static async Task<IResult> CreatePartUrlAsync(
        HttpContext context,
        string uploadId,
        string? key,
        string? provider,
        int? partNumber,
        long? expirySeconds,
        IObjectStoreFactoryAccessor accessor,
        ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key) || partNumber is not (>= 1 and <= 10000))
        {
            return Results.Json(
                new { error = "Query parameters 'key' and 'partNumber' (1-10000) are required.", code = StorageErrorCodes.InvalidPartRequest },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        var maxExpiry = (long)TimeSpan.FromDays(7).TotalSeconds;
        var expiry = expirySeconds is > 0 && expirySeconds <= maxExpiry
            ? TimeSpan.FromSeconds(expirySeconds.Value)
            : TimeSpan.FromHours(24);
        var url = await store.TryPresignPartAsync(normalized, uploadId, partNumber.Value, expiry, context.RequestAborted);
        if (url is null)
        {
            return Results.Json(
                new { error = $"Provider '{store.Id}' cannot presign multipart uploads.", code = StorageErrorCodes.PresignUnsupported },
                statusCode: StatusCodes.Status501NotImplemented);
        }

        logger.LogInformation("PRESIGN MULTIPART PART {Provider}:{Key} #{Part}", store.Id, normalized, partNumber);
        return Results.Ok(new MultipartPartUrlResponse(url, partNumber.Value, accessor.Now + expiry));
    }

    private static async Task<IResult> CompleteMultipartAsync(
        HttpContext context,
        string uploadId,
        string? key,
        string? provider,
        IObjectStoreFactoryAccessor accessor,
        ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Results.Json(new { error = "Query parameter 'key' is required.", code = StorageErrorCodes.KeyRequired }, statusCode: StatusCodes.Status400BadRequest);
        }

        List<MultipartPartETag>? parts;
        try
        {
            parts = await context.Request.ReadFromJsonAsync<List<MultipartPartETag>>(context.RequestAborted);
        }
        catch (System.Text.Json.JsonException)
        {
            parts = null;
        }

        if (parts is null || parts.Count == 0)
        {
            return Results.Json(
                new { error = "Body must be a non-empty array of { partNumber, etag }.", code = StorageErrorCodes.InvalidCompleteRequest },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        await store.CompleteMultipartUploadAsync(normalized, uploadId, parts, context.RequestAborted);
        logger.LogInformation("MULTIPART COMPLETE {Provider}:{Key} ({Parts} parts)", store.Id, normalized, parts.Count);

        var expiresAt = accessor.Now + accessor.Options.UrlExpiry;
        var url = await BuildGetUrlAsync(context, accessor, store, normalized, expiresAt);
        return Results.Json(
            new ObjectUrlResponse(url, normalized, store.Id, null, null, expiresAt),
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> AbortMultipartAsync(
        HttpContext context,
        string uploadId,
        string? key,
        string? provider,
        IObjectStoreFactoryAccessor accessor,
        ILogger<Program> logger)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Results.Json(new { error = "Query parameter 'key' is required.", code = StorageErrorCodes.KeyRequired }, statusCode: StatusCodes.Status400BadRequest);
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        await store.AbortMultipartUploadAsync(normalized, uploadId, context.RequestAborted);
        logger.LogInformation("MULTIPART ABORT {Provider}:{Key}", store.Id, normalized);
        return Results.NoContent();
    }

    private static async Task<string> BuildGetUrlAsync(
        HttpContext context,
        IObjectStoreFactoryAccessor accessor,
        IObjectStore store,
        string key,
        DateTimeOffset expiresAt)
    {
        if (store.CanPresign)
        {
            var presigned = await store.TryPresignGetAsync(key, expiresAt - accessor.Now, context.RequestAborted);
            if (presigned is not null)
            {
                return presigned;
            }
        }

        var baseUrl = accessor.Options.PublicBaseUrl;
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}";
        }

        return SignedObjectUrl.Create(baseUrl, store.Id, key, expiresAt, accessor.Signer);
    }

    private static IResult Unauthorized() =>
        Results.Json(new { error = "Missing or invalid API key.", code = StorageErrorCodes.ApiKeyMissing }, statusCode: StatusCodes.Status401Unauthorized);

    private sealed record ObjectUrlResponse(
        string Url,
        string Key,
        string Provider,
        long? SizeBytes,
        string? ContentType,
        DateTimeOffset ExpiresAt);

    private sealed record MultipartCreateResponse(string UploadId, string Key, string Provider);

    private sealed record MultipartPartUrlResponse(string Url, int PartNumber, DateTimeOffset ExpiresAt);
}
