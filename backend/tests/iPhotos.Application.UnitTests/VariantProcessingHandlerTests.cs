using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Domain;

namespace iPhotos.Application.UnitTests;

public class VariantProcessingHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantRepository _variants = new();
    private readonly FakeBlobStorage _blobs = new();
    private readonly FakeImageVariantGenerator _generator = new();
    private readonly FakeExifExtractor _exif = new();
    private readonly FakeVideoProcessor _video = new();
    private readonly FakeUnitOfWork _uow = new();

    private VariantProcessingHandler NewHandler() =>
        new(_photos, _variants, _blobs, _generator, _exif, _video, _uow, new StubDateTimeProvider(Now));

    private async Task<Photo> NewProcessedPhoto()
    {
        var owner = User.Create("owner@example.com", "hash", null, 1_000_000, Now);
        var photo = Photo.Create(owner.Id, "hash123", "p.jpg", "image/jpeg", 100, Now);
        photo.OriginalBlobPath = $"{owner.Id}/{photo.Id}/original.jpg";
        _photos.Photos.Add(photo);
        _blobs.Blobs[photo.OriginalBlobPath] = new byte[100];
        await Task.CompletedTask;
        return photo;
    }

    private async Task<Photo> NewProcessedVideo()
    {
        var owner = User.Create("owner@example.com", "hash", null, 1_000_000, Now);
        var photo = Photo.Create(owner.Id, "hash456", "clip.mp4", "video/mp4", 500, Now, MediaType.Video);
        photo.OriginalBlobPath = $"{owner.Id}/{photo.Id}/original.mp4";
        _photos.Photos.Add(photo);
        _blobs.Blobs[photo.OriginalBlobPath] = new byte[500];
        await Task.CompletedTask;
        return photo;
    }

    private static VariantJob NewJob(Guid photoId)
    {
        var job = VariantJob.Create(photoId, Now);
        job.Start();
        return job;
    }

    [Fact]
    public async Task Process_GeneratesVariantsIndexesMetadataAndMarksReady()
    {
        var photo = await NewProcessedPhoto();
        var job = NewJob(photo.Id);

        await NewHandler().ProcessJobAsync(job);

        photo.State.ShouldBe(PhotoState.Ready);
        photo.Width.ShouldBe(4032);
        photo.Height.ShouldBe(3024);
        photo.TakenAt.ShouldBe(_exif.Metadata.TakenAt);
        photo.CameraModel.ShouldBe("Pixel 9");
        photo.GpsLatitude.ShouldBe(-22.9);

        job.State.ShouldBe(JobState.Done);

        _variants.Variants.Select(v => v.Kind).ShouldBe(
            [VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail], ignoreOrder: true);

        var thumb = _variants.Variants.Single(v => v.Kind == VariantKind.Thumbnail);
        thumb.BlobPath.ShouldBe($"{photo.OwnerId}/{photo.Id}/thumb.jpg");
        thumb.Width.ShouldBe(10);
        thumb.Height.ShouldBe(5);
        thumb.Format.ShouldBe("jpeg");
        _blobs.Blobs.Keys.ShouldContain($"{photo.OwnerId}/{photo.Id}/thumb.jpg");
        _blobs.Blobs.Keys.ShouldContain($"{photo.OwnerId}/{photo.Id}/preview.jpg");

        var original = _variants.Variants.Single(v => v.Kind == VariantKind.Original);
        original.BlobPath.ShouldBe(photo.OriginalBlobPath);
        original.SizeBytes.ShouldBe(100);
    }

    [Fact]
    public async Task Process_MissingPhoto_CompletesJob()
    {
        var job = NewJob(Guid.NewGuid());

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        _variants.Variants.ShouldBeEmpty();
    }

    [Fact]
    public async Task Process_GeneratorThrows_FailsPhotoAndRequeuesJob()
    {
        var photo = await NewProcessedPhoto();
        var job = NewJob(photo.Id);
        _generator.ThrowOnGenerate = new InvalidOperationException("cannot decode");

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(1);
        job.LastError.ShouldBe("cannot decode");
        photo.State.ShouldBe(PhotoState.Failed);
        photo.LastError.ShouldBe("cannot decode");
    }

    [Fact]
    public async Task Process_LastAttempt_FailsJobPermanently()
    {
        var photo = await NewProcessedPhoto();
        _generator.ThrowOnGenerate = new InvalidOperationException("cannot decode");

        var handler = NewHandler();
        var job = NewJob(photo.Id);
        await handler.ProcessJobAsync(job); // attempt 1 → requeued
        job.Start();
        await handler.ProcessJobAsync(job); // attempt 2 → requeued
        job.Start();
        await handler.ProcessJobAsync(job); // attempt 3 → permanent

        job.State.ShouldBe(JobState.Failed);
        job.Attempts.ShouldBe(3);
        photo.State.ShouldBe(PhotoState.Failed);
    }

    [Fact]
    public async Task Process_IsIdempotent_WhenRetryingAfterPartialVariants()
    {
        var photo = await NewProcessedPhoto();
        var job = NewJob(photo.Id);
        // leftover variant rows from a previous partial run
        _variants.Variants.Add(PhotoVariant.Create(photo.Id, VariantKind.Thumbnail, "stale.jpg", 1, 1, 1, "jpeg", Now));

        await NewHandler().ProcessJobAsync(job);

        _variants.Variants.Count.ShouldBe(3);
        _variants.Variants.ShouldNotContain(v => v.BlobPath == "stale.jpg");
    }

    [Fact]
    public async Task Process_Video_UsesVideoProcessorAndMarksReady()
    {
        var photo = await NewProcessedVideo();
        var job = NewJob(photo.Id);

        await NewHandler().ProcessJobAsync(job);

        photo.State.ShouldBe(PhotoState.Ready);
        photo.Width.ShouldBe(1920);
        photo.Height.ShouldBe(1080);
        photo.DurationSeconds.ShouldBe(_video.Info.DurationSeconds);
        job.State.ShouldBe(JobState.Done);

        _variants.Variants.Select(v => v.Kind).ShouldBe(
            [VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail], ignoreOrder: true);

        var original = _variants.Variants.Single(v => v.Kind == VariantKind.Original);
        original.BlobPath.ShouldBe(photo.OriginalBlobPath);
        original.Format.ShouldBe("mp4");
        original.SizeBytes.ShouldBe(500);

        // Poster feeds the regular pipeline: same preview/thumbnail paths as photos.
        var thumb = _variants.Variants.Single(v => v.Kind == VariantKind.Thumbnail);
        thumb.BlobPath.ShouldBe($"{photo.OwnerId}/{photo.Id}/thumb.jpg");
        thumb.Format.ShouldBe("jpeg");
        _blobs.Blobs.Keys.ShouldContain($"{photo.OwnerId}/{photo.Id}/thumb.jpg");
        _blobs.Blobs.Keys.ShouldContain($"{photo.OwnerId}/{photo.Id}/preview.jpg");
    }

    [Fact]
    public async Task Process_VideoProcessorThrows_FailsPhotoAndRequeuesJob()
    {
        var photo = await NewProcessedVideo();
        var job = NewJob(photo.Id);
        _video.ThrowOnProcess = new InvalidImageException("The stream is not a decodable video.");

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(1);
        photo.State.ShouldBe(PhotoState.Failed);
    }
}
