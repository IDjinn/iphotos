using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Upload;
using DriveFile = Google.Apis.Drive.v3.Data.File;

namespace iPhotos.Storage.Providers;

/// <summary>
/// Google Drive via a service account. Objects become files inside the configured root
/// folder; the caller key is stored in each file's appProperties ("iphotos_key") and
/// resolved lazily with an in-memory cache. Always served through this host (private
/// Drive files are not hotlinkable); reads are buffered in memory, which is fine for
/// photo-sized objects. A service account has no personal quota — point the root at a
/// folder inside a Shared Drive.
/// </summary>
public sealed class GoogleDriveObjectStore : IObjectStore
{
    private const string KeyProperty = "iphotos_key";

    private readonly DriveService _drive;
    private readonly string _rootFolderId;
    private readonly Dictionary<string, string> _fileIdByKey = new();

    public GoogleDriveObjectStore(GoogleDriveProviderOptions options)
    {
        var json = !string.IsNullOrWhiteSpace(options.ServiceAccountJson)
            ? options.ServiceAccountJson
            : File.ReadAllText(options.ServiceAccountJsonPath);

        var credential = GoogleCredential
            .FromJson(json)
            .CreateScoped(DriveService.Scope.Drive);

        _drive = new DriveService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = options.ApplicationName,
        });

        _rootFolderId = options.RootFolderId;
    }

    public string Id => "googledrive";

    public bool CanPresign => false;

    public async Task<ObjectWriteResult> PutAsync(string key, Stream content, string? contentType, CancellationToken cancellationToken = default)
    {
        var normalized = ObjectKey.Normalize(key);

        // Same key = replace content in place, keeping the key→fileId mapping stable.
        var existingId = await TryResolveFileIdAsync(normalized, cancellationToken);
        if (existingId is not null)
        {
            var update = _drive.Files.Update(new DriveFile { MimeType = contentType }, existingId, content, contentType);
            update.Fields = "size,md5Checksum";
            var updated = await update.UploadAsync(cancellationToken);
            if (updated.Status != UploadStatus.Completed)
            {
                throw new ProviderException($"Google Drive replace failed ({updated.Exception?.Message ?? updated.Status.ToString()}).");
            }

            return new ObjectWriteResult(update.ResponseBody?.Size ?? 0, ETag: null);
        }

        var metadata = new DriveFile
        {
            Name = normalized.Split('/')[^1],
            MimeType = contentType,
            AppProperties = new Dictionary<string, string> { [KeyProperty] = normalized },
        };
        if (!string.IsNullOrEmpty(_rootFolderId))
        {
            metadata.Parents = new List<string> { _rootFolderId };
        }

        var insert = _drive.Files.Create(metadata, content, contentType);
        insert.Fields = "id,size";
        var result = await insert.UploadAsync(cancellationToken);
        if (result.Status != UploadStatus.Completed)
        {
            throw new ProviderException($"Google Drive upload failed ({result.Exception?.Message ?? result.Status.ToString()}).");
        }

        var fileId = insert.ResponseBody?.Id;
        if (fileId is not null)
        {
            lock (_fileIdByKey)
            {
                _fileIdByKey[normalized] = fileId;
            }
        }

        return new ObjectWriteResult(insert.ResponseBody?.Size ?? 0, ETag: null);
    }

    public async Task<ObjectReadResult> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        var fileId = await ResolveFileIdAsync(key, cancellationToken);
        var request = _drive.Files.Get(fileId);
        request.SupportsAllDrives = true;

        var content = new MemoryStream();
        await request.DownloadAsync(content, cancellationToken);
        content.Position = 0;
        return new ObjectReadResult(content, "application/octet-stream", content.Length, ETag: null);
    }

    public async Task<ObjectHeadInfo> HeadAsync(string key, CancellationToken cancellationToken = default)
    {
        var fileId = await ResolveFileIdAsync(key, cancellationToken);
        var request = _drive.Files.Get(fileId);
        request.SupportsAllDrives = true;
        request.Fields = "size,md5Checksum";
        var file = await request.ExecuteAsync(cancellationToken);
        return new ObjectHeadInfo(file.Size, file.Md5Checksum);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var normalized = ObjectKey.Normalize(key);
        var fileId = await TryResolveFileIdAsync(normalized, cancellationToken);
        if (fileId is null)
        {
            return;
        }

        var request = _drive.Files.Delete(fileId);
        request.SupportsAllDrives = true;
        try
        {
            await request.ExecuteAsync(cancellationToken);
        }
        catch (Google.GoogleApiException e) when (e.HttpStatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Already gone — delete is idempotent.
        }

        lock (_fileIdByKey)
        {
            _fileIdByKey.Remove(normalized);
        }
    }

    public Task<string?> TryPresignGetAsync(string key, TimeSpan expiry, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    public Task<string?> TryPresignPutAsync(string key, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    private async Task<string> ResolveFileIdAsync(string key, CancellationToken cancellationToken)
    {
        var fileId = await TryResolveFileIdAsync(ObjectKey.Normalize(key), cancellationToken);
        if (fileId is null)
        {
            throw new ObjectNotFoundException(Id, key);
        }

        return fileId;
    }

    private async Task<string?> TryResolveFileIdAsync(string normalizedKey, CancellationToken cancellationToken)
    {
        lock (_fileIdByKey)
        {
            if (_fileIdByKey.TryGetValue(normalizedKey, out var cached))
            {
                return cached;
            }
        }

        var escaped = normalizedKey.Replace("'", "\\'", StringComparison.Ordinal);
        var request = _drive.Files.List();
        request.Q = $"appProperties has {{ key='{KeyProperty}' and value='{escaped}' }} and trashed = false";
        request.Spaces = "drive";
        request.IncludeItemsFromAllDrives = true;
        request.SupportsAllDrives = true;
        request.Fields = "nextPageToken,files(id)";

        string? found = null;
        do
        {
            var page = await request.ExecuteAsync(cancellationToken);
            found = page.Files?.FirstOrDefault()?.Id;
            request.PageToken = page.NextPageToken;
        }
        while (found is null && request.PageToken is not null);

        if (found is not null)
        {
            lock (_fileIdByKey)
            {
                _fileIdByKey[normalizedKey] = found;
            }
        }

        return found;
    }
}
