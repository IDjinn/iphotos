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

        // Catch-all routes must end the template, so the url endpoint hangs off /api/objects
        // directly: POST /api/objects/url?key=...&provider=...&expirySeconds=...
        app.MapPost("/api/objects/url", CreateUrlAsync);
    }

    private static async Task<IResult> PutAsync(HttpContext context, string key, string? provider, IObjectStoreFactoryAccessor accessor)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        var store = accessor.Resolve(provider);
        var normalized = ObjectKey.Normalize(key);
        await using var body = context.Request.Body;
        var result = await store.PutAsync(normalized, body, context.Request.ContentType, context.RequestAborted);

        var expiresAt = accessor.Now + accessor.Options.UrlExpiry;
        var url = await BuildGetUrlAsync(context, accessor, store, normalized, expiresAt);
        return Results.Json(
            new ObjectUrlResponse(url, normalized, store.Id, result.SizeBytes, context.Request.ContentType, expiresAt),
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetAsync(HttpContext context, string key, string? provider, long? exp, string? sig, IObjectStoreFactoryAccessor accessor)
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

            return Results.Empty;
        }

        if (accessor.Options.RedirectToPresigned && store.CanPresign)
        {
            var presigned = await store.TryPresignGetAsync(normalized, accessor.Options.UrlExpiry, context.RequestAborted);
            if (presigned is not null)
            {
                return Results.Redirect(presigned, permanent: false, preserveMethod: false);
            }
        }

        var read = await store.OpenReadAsync(normalized, context.RequestAborted);
        return Results.Stream(read.Content, read.ContentType ?? "application/octet-stream", enableRangeProcessing: true);
    }

    private static async Task<IResult> DeleteAsync(HttpContext context, string key, string? provider, IObjectStoreFactoryAccessor accessor)
    {
        if (!accessor.IsApiKeyValid(context))
        {
            return Unauthorized();
        }

        var store = accessor.Resolve(provider);
        await store.DeleteAsync(ObjectKey.Normalize(key), context.RequestAborted);
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
            return Results.Json(new { error = "Query parameter 'key' is required." }, statusCode: StatusCodes.Status400BadRequest);
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
        Results.Json(new { error = "Missing or invalid API key." }, statusCode: StatusCodes.Status401Unauthorized);

    private sealed record ObjectUrlResponse(
        string Url,
        string Key,
        string Provider,
        long? SizeBytes,
        string? ContentType,
        DateTimeOffset ExpiresAt);
}
