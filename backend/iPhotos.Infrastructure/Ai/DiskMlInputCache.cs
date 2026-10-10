using iPhotos.Application;
using iPhotos.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.Ai;

/// <summary>
/// Disk-backed ML input cache. Files live under Ml:InputCacheDir — a compose named
/// volume shared by the api and worker (the direct-upload path generates variants in
/// the api process; the ML jobs are claimed by the worker). Every operation is
/// best-effort: IO failures are logged and swallowed so a broken cache directory
/// degrades to the blob-storage fallback instead of failing jobs.
/// </summary>
public sealed class DiskMlInputCache(
    IOptions<MlOptions> options,
    ILogger<DiskMlInputCache> logger) : IMlInputCache
{
    public async Task SaveAsync(Guid photoId, MlInputKind kind, Stream content, CancellationToken cancellationToken = default)
    {
        try
        {
            Directory.CreateDirectory(Root);
            var tempPath = Path.Combine(Root, $"{FileName(photoId, kind)}.tmp");

            await using (var target = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                content.Position = 0;
                await content.CopyToAsync(target, cancellationToken);
                if (content.CanSeek)
                {
                    content.Position = 0;
                }
            }

            // Atomic rename: a concurrent reader never sees partial bytes.
            File.Move(tempPath, Path.Combine(Root, FileName(photoId, kind)), overwrite: true);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ML input cache: failed to save {File}", FileName(photoId, kind));
        }
    }

    public Task<Stream?> TryOpenReadAsync(Guid photoId, MlInputKind kind, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = Path.Combine(Root, FileName(photoId, kind));
            if (!File.Exists(path))
            {
                return Task.FromResult<Stream?>(null);
            }

            Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            return Task.FromResult<Stream?>(stream);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "ML input cache: miss for {File}", FileName(photoId, kind));
            return Task.FromResult<Stream?>(null);
        }
    }

    public void Delete(Guid photoId, MlInputKind kind)
    {
        try
        {
            File.Delete(Path.Combine(Root, FileName(photoId, kind)));
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "ML input cache: delete failed for {File}", FileName(photoId, kind));
        }
    }

    public Task DeleteStaleAsync(TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        try
        {
            if (!Directory.Exists(Root))
            {
                return Task.CompletedTask;
            }

            var cutoff = DateTime.UtcNow - maxAge;
            foreach (var file in Directory.EnumerateFiles(Root))
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    if (File.GetLastWriteTimeUtc(file) < cutoff)
                    {
                        File.Delete(file);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogDebug(ex, "ML input cache: stale sweep skipped {File}", file);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ML input cache: stale sweep failed");
        }

        return Task.CompletedTask;
    }

    private string Root => string.IsNullOrWhiteSpace(options.Value.InputCacheDir)
        ? Path.Combine(Path.GetTempPath(), "iphotos-ml-inputs")
        : options.Value.InputCacheDir;

    private static string FileName(Guid photoId, MlInputKind kind) =>
        $"{photoId:N}.{kind.ToString().ToLowerInvariant()}.jpg";
}
