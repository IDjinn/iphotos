using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;

namespace iPhotos.Storage.Providers;

/// <summary>
/// Minimal WebDAV client (PUT/GET/HEAD/DELETE/MKCOL with basic auth) covering Nextcloud,
/// Hetzner Storage Box and generic servers. No multipart upload: objects are single PUTs.
/// </summary>
public sealed class WebDavObjectStore : IObjectStore
{
    private readonly HttpClient _http;
    private readonly string _rootUrl;
    private readonly bool _ownsHttpClient;

    public WebDavObjectStore(WebDavProviderOptions options, bool allowPrivateNetworks)
        : this(options, CreateClient(options), allowPrivateNetworks, ownsHttpClient: true)
    {
    }

    public WebDavObjectStore(WebDavProviderOptions options, HttpClient httpClient, bool allowPrivateNetworks, bool ownsHttpClient = false)
    {
        _http = httpClient;
        _ownsHttpClient = ownsHttpClient;

        var baseUri = PrivateNetworkGuard
            .ValidateAsync(options.BaseUrl, allowPrivateNetworks)
            .GetAwaiter().GetResult();

        var root = options.RootPath.Replace('\\', '/').Trim('/');
        var baseWithSlash = baseUri.AbsoluteUri.EndsWith('/') ? baseUri.AbsoluteUri : baseUri.AbsoluteUri + "/";
        _rootUrl = baseWithSlash + string.Join('/', root.Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString));
        if (_rootUrl.EndsWith('/'))
        {
            _rootUrl = _rootUrl[..^1];
        }
    }

    public string Id => "webdav";

    public bool CanPresign => false;

    private static HttpClient CreateClient(WebDavProviderOptions options)
    {
        var handler = new HttpClientHandler();
        if (!string.IsNullOrEmpty(options.Username) || !string.IsNullOrEmpty(options.Password))
        {
            handler.Credentials = new NetworkCredential(options.Username, options.Password);
            handler.PreAuthenticate = true;
        }

        return new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds),
        };
    }

    public async Task<ObjectWriteResult> PutAsync(string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        await EnsureCollectionChainAsync(ObjectKey.Normalize(key), cancellationToken);

        using var request = new HttpRequestMessage(HttpMethod.Put, ObjectUrl(key));
        request.Content = new StreamContent(content);
        if (!string.IsNullOrEmpty(contentType))
        {
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        }

        using var response = await SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new ProviderException($"WebDAV put failed ({(int)response.StatusCode} {response.StatusCode}).");
        }

        var size = content.CanSeek ? content.Length : response.Content.Headers.ContentLength;
        return new ObjectWriteResult(size ?? 0, response.Headers.ETag?.Tag);
    }

    public async Task<ObjectReadResult> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, ObjectUrl(key));
        // No `using` on success: response ownership moves to the returned DisposingStream.
        var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            response.Dispose();
            throw new ObjectNotFoundException(Id, key);
        }

        if (!response.IsSuccessStatusCode)
        {
            var status = response.StatusCode;
            response.Dispose();
            throw new ProviderException($"WebDAV get failed ({(int)status} {status}).");
        }

        var content = new DisposingStream(await response.Content.ReadAsStreamAsync(cancellationToken), response);
        return new ObjectReadResult(content, response.Content.Headers.ContentType?.ToString(),
            response.Content.Headers.ContentLength, response.Headers.ETag?.Tag);
    }

    public async Task<ObjectHeadInfo> HeadAsync(string key, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Head, ObjectUrl(key));
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new ObjectNotFoundException(Id, key);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new ProviderException($"WebDAV head failed ({(int)response.StatusCode} {response.StatusCode}).");
        }

        return new ObjectHeadInfo(response.Content.Headers.ContentLength, response.Headers.ETag?.Tag);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, ObjectUrl(key));
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode is not (HttpStatusCode.OK or HttpStatusCode.NoContent or HttpStatusCode.NotFound))
        {
            throw new ProviderException($"WebDAV delete failed ({(int)response.StatusCode} {response.StatusCode}).");
        }
    }

    public Task<string?> TryPresignGetAsync(string key, TimeSpan expiry, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    private string ObjectUrl(string key)
    {
        var normalized = ObjectKey.Normalize(key);
        return $"{_rootUrl}/{ObjectKey.EscapePath(normalized)}";
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            response.Dispose();
            throw new ProviderException("WebDAV credentials were rejected.");
        }

        return response;
    }

    /// <summary>WebDAV requires every parent collection to exist; create the missing tail (405 = exists).</summary>
    private async Task EnsureCollectionChainAsync(string normalizedKey, CancellationToken cancellationToken)
    {
        var segments = normalizedKey.Split('/');
        for (var i = 1; i < segments.Length; i++)
        {
            var collectionUrl = $"{_rootUrl}/{string.Join('/', segments[..i].Select(Uri.EscapeDataString))}";
            using var request = new HttpRequestMessage(new HttpMethod("MKCOL"), collectionUrl);
            using var response = await SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.MethodNotAllowed)
            {
                throw new ProviderException($"WebDAV collection creation failed ({(int)response.StatusCode} {response.StatusCode}).");
            }
        }
    }
}
