using iPhotos.Storage;

namespace iPhotos.Storage.Host;

/// <summary>
/// Everything the object endpoints need beyond the request, resolved per call from the
/// request-services scope. Keeps endpoint signatures minimal and testable.
/// </summary>
public interface IObjectStoreFactoryAccessor
{
    StorageServiceOptions Options { get; }

    HmacUrlSigner Signer { get; }

    DateTimeOffset Now { get; }

    IObjectStore Resolve(string? providerId);

    bool IsApiKeyValid(HttpContext context);

    bool IsSignatureValid(HttpContext context, string method, string providerId, string key, long? exp, string? sig);
}

public sealed class RequestObjectStoreFactoryAccessor(IHttpContextAccessor httpContextAccessor) : IObjectStoreFactoryAccessor
{
    private HmacUrlSigner? _signer;

    private HttpContext Context => httpContextAccessor.HttpContext
        ?? throw new InvalidOperationException("No active HttpContext.");

    public StorageServiceOptions Options =>
        Context.RequestServices.GetRequiredService<Microsoft.Extensions.Options.IOptions<StorageServiceOptions>>().Value;

    public HmacUrlSigner Signer => _signer ??= Context.RequestServices.GetRequiredService<HmacUrlSigner>();

    public DateTimeOffset Now => DateTimeOffset.UtcNow;

    public IObjectStore Resolve(string? providerId) =>
        Context.RequestServices.GetRequiredService<ObjectStoreFactory>().Resolve(providerId);

    public bool IsApiKeyValid(HttpContext context)
    {
        var provided = context.Request.Headers["X-Api-Key"].FirstOrDefault();
        return ApiKeyValidator.IsValid(provided, Options.ApiKey);
    }

    public bool IsSignatureValid(HttpContext context, string method, string providerId, string key, long? exp, string? sig) =>
        exp is not null
        && Signer.TryValidate(method, providerId, key, exp.Value, sig, DateTimeOffset.UtcNow);
}
