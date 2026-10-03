using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using iPhotos.Application;
using iPhotos.Application.Common;
using iPhotos.Storage;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.Storage;

/// <summary>
/// IBlobStorage backed by the standalone storage service (iPhotos.Storage.Host): every
/// operation is an HTTP call carrying the raw payload; the database keeps blob *keys*,
/// so the URL returned on upload is ignored. Reads are buffered into a delete-on-close
/// temp file so consumers (ImageSharp) can seek without holding 200 MB in memory.
/// </summary>
public sealed class HttpBlobStorage : IBlobStorage, IDisposable
{
    private readonly HttpClient _http;
    private readonly string _providerQuery;
    private readonly bool _ownsHttpClient;

    public HttpBlobStorage(IOptions<HttpBlobStorageOptions> options)
        : this(options.Value)
    {
    }

    public HttpBlobStorage(HttpBlobStorageOptions options, HttpMessageHandler? handler = null)
    {
        if (!options.IsConfigured)
        {
            throw new InvalidOperationException("StorageService:BaseUrl is required for blob storage mode 'Http'.");
        }

        var baseUri = PrivateNetworkGuard
            .ValidateAsync(options.BaseUrl, options.AllowPrivateNetworks)
            .GetAwaiter().GetResult();

        _providerQuery = string.IsNullOrWhiteSpace(options.Provider)
            ? string.Empty
            : $"?provider={Uri.EscapeDataString(options.Provider)}";
        _ownsHttpClient = handler is null;
        _http = handler is null
            ? new HttpClient() { BaseAddress = baseUri, Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds) }
            : new HttpClient(handler) { BaseAddress = baseUri };
        if (!string.IsNullOrEmpty(options.ApiKey))
        {
            _http.DefaultRequestHeaders.Add("X-Api-Key", options.ApiKey);
        }
    }

    public void Dispose()
    {
        if (_ownsHttpClient)
        {
            _http.Dispose();
        }
    }

    public async Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, ObjectUrl(path))
        {
            Content = new StreamContent(content),
        };
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw Error("put", response);
        }
    }

    public async Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, ObjectUrl(path));
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FileNotFoundException($"Blob '{path}' not found.", path);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw Error("read", response);
        }

        // Buffer into a delete-on-close temp file: seekable for ImageSharp, memory-safe for originals.
        var buffer = new FileStream(
            Path.Combine(Path.GetTempPath(), "iphotos-blob-" + Guid.NewGuid().ToString("N")),
            FileMode.Create, FileAccess.ReadWrite, FileShare.None, bufferSize: 64 * 1024,
            FileOptions.DeleteOnClose | FileOptions.SequentialScan);
        try
        {
            await response.Content.CopyToAsync(buffer, cancellationToken);
            buffer.Seek(0, SeekOrigin.Begin);
            return buffer;
        }
        catch
        {
            await buffer.DisposeAsync();
            throw;
        }
        finally
        {
            response.Dispose();
        }
    }

    public async Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, ObjectUrl(path));
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.NoContent or HttpStatusCode.OK)
        {
            return;
        }

        throw Error("delete", response);
    }

    public async Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Head, ObjectUrl(path));
        using var response = await _http.SendAsync(request, cancellationToken);
        return response.StatusCode switch
        {
            HttpStatusCode.OK => true,
            HttpStatusCode.NotFound => false,
            _ => throw Error("head", response),
        };
    }

    public async Task<BlobUploadUrl?> TryCreateUploadUrlAsync(
        string path, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default)
    {
        var query = $"key={Uri.EscapeDataString(ObjectKey.Normalize(path))}{_providerQuery}"
            + $"&expirySeconds={(long)expiry.TotalSeconds}";
        if (!string.IsNullOrEmpty(contentType))
        {
            query += $"&contentType={Uri.EscapeDataString(contentType)}";
        }

        using var response = await _http.PostAsync($"api/objects/upload-url?{query}", content: null, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotImplemented)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw Error("presign", response);
        }

        var body = await response.Content
            .ReadFromJsonAsync<UploadUrlResponse>(cancellationToken: cancellationToken);
        return body is null ? null : new BlobUploadUrl(body.Url, body.ExpiresAt);
    }

    private sealed record UploadUrlResponse(string Url, DateTimeOffset ExpiresAt);

    private string ObjectUrl(string path)
    {
        var normalized = ObjectKey.Normalize(path);
        return $"api/objects/{ObjectKey.EscapePath(normalized)}{_providerQuery}";
    }

    private static IOException Error(string operation, HttpResponseMessage response) =>
        new($"Storage service {operation} failed ({(int)response.StatusCode} {response.StatusCode}).");
}
