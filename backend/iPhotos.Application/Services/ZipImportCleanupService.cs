using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace iPhotos.Application.Services;

/// <summary>What one cleanup pass accomplished (for logs and tests).</summary>
public readonly record struct ZipImportCleanupReport(int FailedUploads, int BlobsDeleted);

/// <summary>
/// One cleanup pass over zip-import leftovers:
/// <list type="number">
///   <item>Permanently fails <c>Uploading</c> jobs older than the given age — their HTTP
///   upload died with a previous API process, so the bytes are gone (the caller picks the
///   age: a short one at startup, a conservative one on periodic passes).</item>
///   <item>Deletes the staged archive of every terminal job (<c>Failed</c>/<c>Done</c>)
///   that still has one, then records <c>BlobDeletedAt</c> so the job is never
///   re-examined. The endpoint and the handler both delete the archive on their happy
///   paths — this catches the cases that die in between: the API process crashing
///   mid-upload, or a failed job whose best-effort cleanup itself failed.</item>
/// </list>
/// Safe to run repeatedly: blob deletion is idempotent, and only jobs with a null
/// <c>BlobDeletedAt</c> are examined. Invoked by the worker's cleanup hosted service.
/// </summary>
public sealed class ZipImportCleanupService(
    IZipImportRepository imports,
    [FromKeyedServices("staging")] IBlobStorage stagingBlobs,
    IDateTimeProvider dateTime,
    ILogger<ZipImportCleanupService> logger)
{
    public async Task<ZipImportCleanupReport> RunOnceAsync(
        TimeSpan staleUploadAge, CancellationToken cancellationToken = default)
    {
        var failedUploads = await imports.FailStaleUploadsAsync(staleUploadAge, cancellationToken);

        var blobsDeleted = 0;
        var jobs = await imports.ListWithStagedBlobAsync(cancellationToken);
        var now = dateTime.UtcNow;
        foreach (var job in jobs)
        {
            try
            {
                await stagingBlobs.DeleteAsync(job.BlobPath, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Blob already gone or storage unavailable — leave BlobDeletedAt null so
                // the next pass retries; the row itself stays (it is import history).
                logger.LogWarning(ex, "Could not delete staged archive {BlobPath} of import job {JobId}",
                    job.BlobPath, job.Id);
                continue;
            }

            job.MarkBlobDeleted(now);
            await imports.SaveAsync(job, cancellationToken);
            blobsDeleted++;
            logger.LogInformation(
                "Deleted staged archive {BlobPath} of import job {JobId} (state {State})",
                job.BlobPath, job.Id, job.State);
        }

        return new ZipImportCleanupReport(failedUploads, blobsDeleted);
    }
}
