using System.IO.Compression;
using ICSharpCode.SharpZipLib.Zip;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Aborts the whole import with a permanent failure: no retry can fix the cause.
/// </summary>
public sealed class ZipImportAbortException(string message) : Exception(message);

/// <summary>
/// Processes a claimed zip import job (e.g. a Google Takeout archive): extracts the
/// archive entry by entry, transcodes HEIC/HEIF to JPEG, and ingests supported images
/// and videos through PhotoService (per-owner hash dedup included), tracking per-entry
/// counters. Catalog metadata (takenAt, GPS, title, description) is seeded from
/// Takeout sidecar JSON files (<see cref="TakeoutMetadata"/>); remaining sidecars and
/// junk count as ignored. The raw archive is read from (and deleted from) the
/// "staging" blob storage — a local-disk provider, never the remote blob target; only
/// ingested media lands there. Executed by the iPhotos.Worker background service.
/// Re-running a partially imported zip is safe — hash dedup turns already-imported
/// entries into duplicates.
/// </summary>
public sealed class ZipImportHandler(
    IZipImportRepository imports,
    [FromKeyedServices("staging")] IBlobStorage blobStorage,
    PhotoService photoService,
    IHeifConverter heifConverter,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    ILogger<ZipImportHandler> logger,
    IOptions<ZipImportOptions> optionsAccessor)
{
    private static readonly HashSet<string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".webp" };

    private static readonly HashSet<string> HeifExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".heic", ".heif" };

    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".mp4", ".mov", ".m4v", ".webm", ".avi", ".3gp" };

    private static readonly HashSet<string> SidecarExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".json", ".html", ".htm", ".csv" };

    private static readonly HashSet<string> IgnoredFileNames = new(StringComparer.OrdinalIgnoreCase)
        { "thumbs.db", ".ds_store" };

    public async Task ProcessJobAsync(ZipImportJob job, CancellationToken cancellationToken = default)
    {
        if (job.State == JobState.Queued)
        {
            job.Start();
        }

        try
        {
            await using var zipStream = await blobStorage.OpenReadAsync(job.BlobPath, cancellationToken);

            // The BCL ignores the encryption flag and fails per-entry with a misleading
            // message; SharpZipLib reads the central directory and reports IsCrypted
            // reliably, so detect protected archives up front and abort with a clear error.
            EnsureNotEncrypted(zipStream);

            zipStream.Seek(0, SeekOrigin.Begin);
            using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
            var entries = archive.Entries;

            if (entries.Count > optionsAccessor.Value.MaxEntries)
            {
                throw new ZipImportAbortException(
                    $"ZIP has {entries.Count} entries — the limit is {optionsAccessor.Value.MaxEntries}.");
            }

            job.TotalEntries = entries.Count(e => !IsDirectory(e));
            await unitOfWork.SaveChangesAsync(cancellationToken);

            var sidecars = TakeoutMetadata.BuildSidecarIndex(entries);
            var workDir = ResolveWorkDir();
            Directory.CreateDirectory(workDir);
            var counterSavePoint = 0;

            foreach (var entry in entries)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (IsDirectory(entry))
                {
                    continue;
                }

                try
                {
                    await ProcessEntryAsync(job, entry, sidecars, workDir, cancellationToken);
                }
                catch (QuotaExceededException)
                {
                    throw new ZipImportAbortException(
                        $"Storage quota exceeded — {job.Imported} items imported before stopping.");
                }
                catch (InvalidDataException ex) when (IsEncryptedEntry(ex))
                {
                    throw new ZipImportAbortException("Protected/encrypted ZIPs are not supported.");
                }
                catch (NotSupportedException ex) when (IsEncryptedEntry(ex))
                {
                    throw new ZipImportAbortException("Protected/encrypted ZIPs are not supported.");
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (InvalidImageException ex)
                {
                    job.Failed++;
                    logger.LogWarning(ex, "Zip import {JobId}: entry '{Entry}' is not a decodable image",
                        job.Id, entry.FullName);
                }
                catch (Exception ex)
                {
                    job.Failed++;
                    logger.LogWarning(ex, "Zip import {JobId}: entry '{Entry}' failed", job.Id, entry.FullName);
                }
                finally
                {
                    job.ProcessedEntries++;
                }

                // PhotoService persists on every ingest; flush the ignore/failure
                // counters (and quota/encrypted-abort progress) periodically.
                if (++counterSavePoint >= 10)
                {
                    counterSavePoint = 0;
                    await unitOfWork.SaveChangesAsync(cancellationToken);
                }
            }

            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            await blobStorage.DeleteAsync(job.BlobPath, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (ZipImportAbortException ex)
        {
            job.FailPermanently(ex.Message, dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            logger.LogWarning(ex, "Zip import {JobId} failed (attempt {Attempt}/{Max}, retry: {WillRetry})",
                job.Id, job.Attempts, job.MaxAttempts, willRetry);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task ProcessEntryAsync(
        ZipImportJob job,
        ZipArchiveEntry entry,
        Dictionary<string, ZipArchiveEntry> sidecars,
        string workDir,
        CancellationToken cancellationToken)
    {
        var fileName = Path.GetFileName(entry.FullName.Replace('\\', '/'));
        var extension = Path.GetExtension(fileName);

        if (IsHiddenOrJunk(entry.FullName, fileName))
        {
            job.Ignored++;
            return;
        }

        if (SidecarExtensions.Contains(extension)
            || extension.Equals(".zip", StringComparison.OrdinalIgnoreCase))
        {
            job.Ignored++;
            return;
        }

        var isHeif = HeifExtensions.Contains(extension);
        var isVideo = VideoExtensions.Contains(extension);
        if (!isHeif && !isVideo && !PhotoExtensions.Contains(extension))
        {
            job.Ignored++;
            return;
        }

        var seed = TakeoutMetadata.ResolveSeed(entry.FullName, sidecars);

        // GUID-named temp file: no zip-slip, no name collisions, by design.
        var tempPath = Path.Combine(workDir, $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}");
        try
        {
            await using (var target = File.Create(tempPath))
            await using (var source = entry.Open())
            {
                await source.CopyToAsync(target, cancellationToken);
            }

            if (isHeif)
            {
                await using var heifStream = File.OpenRead(tempPath);
                var converted = await heifConverter.ConvertToJpegAsync(heifStream, cancellationToken);
                await using var convertedStream = converted.Content;
                var result = await photoService.UploadAsync(
                    job.OwnerId,
                    Path.ChangeExtension(fileName, ".jpg"),
                    "image/jpeg",
                    convertedStream,
                    seed,
                    cancellationToken);
                CountResult(job, result.Duplicated);
                return;
            }

            await using var mediaStream = File.OpenRead(tempPath);
            var upload = await photoService.UploadAsync(
                job.OwnerId, fileName, MimeFor(extension), mediaStream, seed, cancellationToken);
            CountResult(job, upload.Duplicated, isVideo);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    private static void CountResult(ZipImportJob job, bool duplicated, bool isVideo = false)
    {
        if (duplicated)
        {
            job.Duplicated++;
        }
        else
        {
            job.Imported++;
            if (isVideo)
            {
                job.VideosImported++;
            }
        }
    }

    private static void EnsureNotEncrypted(Stream zipStream)
    {
        zipStream.Seek(0, SeekOrigin.Begin);
        using var zipFile = new ICSharpCode.SharpZipLib.Zip.ZipFile(zipStream);
        zipFile.IsStreamOwner = false;
        foreach (ZipEntry entry in zipFile)
        {
            if (entry.IsCrypted)
            {
                throw new ZipImportAbortException("Protected/encrypted ZIPs are not supported.");
            }
        }
    }

    private static bool IsDirectory(ZipArchiveEntry entry) =>
        entry.FullName.EndsWith('/') || entry.FullName.EndsWith('\\') || entry.Name.Length == 0;

    private static bool IsHiddenOrJunk(string fullName, string fileName)
    {
        if (IgnoredFileNames.Contains(fileName))
        {
            return true;
        }

        // Hidden files (".foo", AppleDouble "._foo"), macOS resource forks.
        if (fileName.StartsWith('.'))
        {
            return true;
        }

        return fullName.Contains("__MACOSX", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsEncryptedEntry(Exception ex) =>
        ex.Message.Contains("encrypt", StringComparison.OrdinalIgnoreCase);

    private static string MimeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".mp4" or ".m4v" => "video/mp4",
        ".mov" => "video/quicktime",
        ".webm" => "video/webm",
        ".avi" => "video/x-msvideo",
        ".3gp" => "video/3gpp",
        _ => "application/octet-stream",
    };

    private string ResolveWorkDir()
    {
        var configured = optionsAccessor.Value.WorkDir;
        return string.IsNullOrWhiteSpace(configured) ? Path.GetTempPath() : configured;
    }
}
