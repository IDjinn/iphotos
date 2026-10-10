using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;

namespace iPhotos.Application.UnitTests;

public class ZipImportCleanupServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryZipImportRepository _imports = new();
    private readonly FakeBlobStorage _blobs = new();

    private ZipImportCleanupService NewService() =>
        new(_imports, _blobs, new StubDateTimeProvider(Now), NullLogger<ZipImportCleanupService>.Instance);

    [Fact]
    public async Task RunOnceAsync_FailsStaleUpload_AndDeletesItsStagedArchive()
    {
        var job = NewJob(JobState.Uploading, createdAgo: TimeSpan.FromHours(2));
        Assert.True((await NewService().RunOnceAsync(staleUploadAge: TimeSpan.FromMinutes(30))).FailedUploads > 0);

        Assert.Equal(JobState.Failed, job.State);
        Assert.NotNull(job.BlobDeletedAt);
        Assert.False(_blobs.Blobs.ContainsKey(job.BlobPath));
    }

    [Fact]
    public async Task RunOnceAsync_LeavesYoungUpload_Alone()
    {
        // Created one minute ago: well inside any sane upload window, even though the
        // fake repository compares against the real clock.
        var job = NewJob(JobState.Uploading, createdAgo: TimeSpan.FromMinutes(-1));
        await NewService().RunOnceAsync(staleUploadAge: TimeSpan.FromMinutes(30));

        Assert.Equal(JobState.Uploading, job.State);
        Assert.Null(job.BlobDeletedAt);
        Assert.True(_blobs.Blobs.ContainsKey(job.BlobPath));
    }

    [Fact]
    public async Task RunOnceAsync_DeletesStagedArchive_OfFailedAndDoneJobs()
    {
        var failed = NewJob(JobState.Failed, createdAgo: TimeSpan.FromDays(2));
        var done = NewJob(JobState.Done, createdAgo: TimeSpan.FromDays(2));
        var report = await NewService().RunOnceAsync(staleUploadAge: TimeSpan.FromMinutes(30));

        Assert.Equal(2, report.BlobsDeleted);
        Assert.NotNull(failed.BlobDeletedAt);
        Assert.NotNull(done.BlobDeletedAt);
        Assert.Empty(_blobs.Blobs);
    }

    [Fact]
    public async Task RunOnceAsync_SkipsJobs_WhoseBlobWasAlreadyCleaned()
    {
        var job = NewJob(JobState.Failed, createdAgo: TimeSpan.FromDays(2));
        job.MarkBlobDeleted(Now);
        await NewService().RunOnceAsync(staleUploadAge: TimeSpan.FromMinutes(30));

        Assert.True(_blobs.Blobs.ContainsKey(job.BlobPath));
    }

    [Fact]
    public async Task RunOnceAsync_KeepsJobUnmarked_WhenBlobDeletionFails()
    {
        var job = NewJob(JobState.Failed, createdAgo: TimeSpan.FromDays(2));
        var service = new ZipImportCleanupService(
            _imports, new ThrowingBlobStorage(), new StubDateTimeProvider(Now),
            NullLogger<ZipImportCleanupService>.Instance);

        var report = await service.RunOnceAsync(staleUploadAge: TimeSpan.FromMinutes(30));

        Assert.Equal(0, report.BlobsDeleted);
        Assert.Null(job.BlobDeletedAt);
    }

    /// <summary>
    /// Creates a terminal-state job with a staged archive. <paramref name="createdAgo"/>
    /// is subtracted from the real clock (the fake repository's staleness filter runs on
    /// DateTimeOffset.UtcNow, not on the stub); negative values create a "young" job.
    /// </summary>
    private ZipImportJob NewJob(JobState state, TimeSpan createdAgo)
    {
        var job = ZipImportJob.CreateUploading(
            Guid.NewGuid(), "takeout.zip", BlobPaths.Import(Guid.NewGuid(), Guid.NewGuid()),
            DateTimeOffset.UtcNow - createdAgo);
        if (state == JobState.Failed)
        {
            job.FailUpload("Upload interrupted.", job.CreatedAt + TimeSpan.FromMinutes(5));
        }
        else if (state == JobState.Done)
        {
            job.MarkQueued(100, job.CreatedAt + TimeSpan.FromMinutes(5));
            job.Start();
            job.Complete(job.CreatedAt + TimeSpan.FromMinutes(10));
        }

        _blobs.Blobs[job.BlobPath] = [1, 2, 3];
        _imports.Jobs.Add(job);
        return job;
    }

    private sealed class ThrowingBlobStorage : IBlobStorage
    {
        public Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
            => throw new KeyNotFoundException($"Blob '{path}' not found.");

        public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("storage unavailable");

        public Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default) => Task.FromResult(false);

        public Task<BlobUploadUrl?> TryCreateUploadUrlAsync(
            string path, TimeSpan expiry, string? contentType, CancellationToken cancellationToken = default)
            => Task.FromResult<BlobUploadUrl?>(null);
    }
}
