using Amazon.S3;
using Amazon.S3.Model;

namespace iPhotos.Storage.Providers;

/// <summary>
/// One implementation for every S3-compatible backend: AWS S3, Wasabi, MinIO,
/// Backblaze B2, Cloudflare R2, Hetzner — configured via endpoint/region/force-path-style.
/// </summary>
public sealed class S3ObjectStore : IObjectStore
{
    private readonly IAmazonS3 _client;
    private readonly string _bucket;
    private readonly string _prefix;
    private readonly bool _isHttpEndpoint;

    public S3ObjectStore(S3ProviderOptions options, bool allowPrivateNetworks)
    {
        _bucket = options.Bucket;
        _prefix = NormalizePrefix(options.Prefix);

        var config = new AmazonS3Config
        {
            RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(options.Region),
            ServiceURL = string.IsNullOrWhiteSpace(options.Endpoint) ? null : options.Endpoint,
            ForcePathStyle = options.ForcePathStyle,
            AuthenticationRegion = options.Region,
        };
        _isHttpEndpoint = options.Endpoint.StartsWith("http://", StringComparison.OrdinalIgnoreCase);
        // Endpoint validation (scheme + SSRF) before any request leaves the process.
        if (!string.IsNullOrWhiteSpace(options.Endpoint))
        {
            PrivateNetworkGuard
                .ValidateAsync(options.Endpoint, allowPrivateNetworks)
                .GetAwaiter().GetResult();
        }

        _client = new AmazonS3Client(options.AccessKey, options.SecretKey, config);
    }

    public string Id => "s3";

    public bool CanPresign => true;

    public async Task<ObjectWriteResult> PutAsync(string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = FullKey(key),
            InputStream = content,
            ContentType = contentType,
            AutoCloseStream = false,
            UseChunkEncoding = false,
        };

        try
        {
            var response = await _client.PutObjectAsync(request, cancellationToken);
            return new ObjectWriteResult(response.ContentLength > 0 ? response.ContentLength : content.Length, response.ETag);
        }
        catch (AmazonS3Exception e)
        {
            throw new ProviderException($"S3 put failed ({e.ErrorCode}).", e);
        }
    }

    public async Task<ObjectReadResult> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _client.GetObjectAsync(_bucket, FullKey(key), cancellationToken);
            var content = new DisposingStream(response.ResponseStream, response);
            return new ObjectReadResult(content, response.Headers.ContentType, response.ContentLength, response.ETag);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound
            || string.Equals(e.ErrorCode, "NoSuchKey", StringComparison.Ordinal))
        {
            throw new ObjectNotFoundException(Id, key);
        }
        catch (AmazonS3Exception e)
        {
            throw new ProviderException($"S3 get failed ({e.ErrorCode}).", e);
        }
    }

    public async Task<ObjectHeadInfo> HeadAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _client.GetObjectMetadataAsync(_bucket, FullKey(key), cancellationToken);
            return new ObjectHeadInfo(response.ContentLength, response.ETag);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound
            || string.Equals(e.ErrorCode, "NoSuchKey", StringComparison.Ordinal))
        {
            throw new ObjectNotFoundException(Id, key);
        }
        catch (AmazonS3Exception e)
        {
            throw new ProviderException($"S3 head failed ({e.ErrorCode}).", e);
        }
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            await _client.DeleteObjectAsync(_bucket, FullKey(key), cancellationToken);
        }
        catch (AmazonS3Exception e)
        {
            throw new ProviderException($"S3 delete failed ({e.ErrorCode}).", e);
        }
    }

    public Task<string?> TryPresignGetAsync(string key, TimeSpan expiry, CancellationToken cancellationToken = default)
    {
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = FullKey(key),
            Verb = Amazon.S3.HttpVerb.GET,
            Expires = DateTime.UtcNow + expiry,
        };
        var url = _client.GetPreSignedURL(request);
        // SigV4 does not cover the scheme: force the endpoint's scheme so plain-http
        // deployments (MinIO/SeaweedFS on a LAN) get consumable presigned URLs.
        if (_isHttpEndpoint && url.StartsWith("https://", StringComparison.Ordinal))
        {
            url = "http://" + url["https://".Length..];
        }

        return Task.FromResult<string?>(url);
    }

    private string FullKey(string key)
    {
        var normalized = ObjectKey.Normalize(key);
        return _prefix.Length == 0 ? normalized : _prefix + normalized;
    }

    internal static string NormalizePrefix(string prefix)
    {
        var normalized = prefix.Replace('\\', '/').Trim('/');
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        // Reuse key validation per segment so a bad prefix fails fast at startup.
        ObjectKey.Normalize(normalized + "/x");
        return normalized + "/";
    }
}
