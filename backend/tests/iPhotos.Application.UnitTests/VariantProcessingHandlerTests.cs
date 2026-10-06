using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;

namespace iPhotos.Application.UnitTests;

public class VariantProcessingHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantRepository _variants = new();
    private readonly InMemoryUserRepository _users = new();
    private readonly FakeBlobStorage _blobs = new();
    private readonly FakeImageVariantGenerator _generator = new();
    private readonly FakeExifExtractor _exif = new();
    private readonly FakeVideoProcessor _video = new();
    private readonly FakeUnitOfWork _uow = new();

    private VariantProcessingHandler NewHandler(
        UploadOptions? uploadOptions = null,
        IImageCompressor? imageCompressor = null,
        IVideoCompressor? videoCompressor = null) =>
        new(_photos, _variants, _users, _blobs, new Sha256ContentHasher(), _generator, _exif, _video,
            imageCompressor ?? new FakeImageCompressor(), videoCompressor ?? new FakeVideoCompressor(),
            _uow, new StubDateTimeProvider(Now),
            Microsoft.Extensions.Options.Options.Create(uploadOptions ?? new UploadOptions()));

    private User Owner(
        string uploadQuality = UploadQualities.StorageSaver,
        string plan = "free")
    {
        var owner = User.Create($"owner-{Guid.NewGuid():N}@example.com", "hash", null, 1_000_000, Now);
        owner.Plan = plan;
        owner.UploadQuality = uploadQuality;
        _users.Users.Add(owner);
        return owner;
    }

    private Photo NewStoredPhoto(
        User owner,
        string fileName,
        string mimeType,
        MediaType mediaType,
        int sizeBytes)
    {
        var photo = Photo.Create(owner.Id, $"hash-{Guid.NewGuid():N}", fileName, mimeType, sizeBytes, Now, mediaType);
        photo.OriginalBlobPath = $"{owner.Id}/{photo.Id}/original{Path.GetExtension(fileName)}";
        _photos.Photos.Add(photo);
        _blobs.Blobs[photo.OriginalBlobPath] = new byte[sizeBytes];
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "clip.mp4", "video/mp4", MediaType.Video, 500);
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
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "clip.mp4", "video/mp4", MediaType.Video, 500);
        var job = NewJob(photo.Id);
        _video.ThrowOnProcess = new InvalidImageException("The stream is not a decodable video.");

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(1);
        photo.State.ShouldBe(PhotoState.Failed);
    }

    // ── Storage-saver application ────────────────────────────────────────────

    [Fact]
    public async Task Process_SaverImageOverCap_CompressesReplacesOriginalAndDropsOldBlob()
    {
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.png", "image/png", MediaType.Photo, 100);
        var job = NewJob(photo.Id);
        var compressed = new byte[50];
        Array.Fill(compressed, (byte)7);

        await NewHandler(new UploadOptions { FreeSaverMaxImageBytes = 50 },
            new FakeImageCompressor((_, _) => new MemoryStream(compressed))).ProcessJobAsync(job);

        // The compressed JPEG becomes the stored original: path, mime, size, hash.
        var newPath = $"{owner.Id}/{photo.Id}/original.jpg";
        photo.OriginalBlobPath.ShouldBe(newPath);
        photo.MimeType.ShouldBe("image/jpeg");
        photo.SizeBytes.ShouldBe(50);
        photo.StoredQuality.ShouldBe(UploadQualities.StorageSaver);
        photo.ContentHash.ShouldBe(Sha256Of(compressed));
        photo.State.ShouldBe(PhotoState.Ready);
        job.State.ShouldBe(JobState.Done);

        _blobs.Blobs.Keys.ShouldContain(newPath);
        _blobs.Blobs.Keys.ShouldNotContain($"{owner.Id}/{photo.Id}/original.png");

        var original = _variants.Variants.Single(v => v.Kind == VariantKind.Original);
        original.BlobPath.ShouldBe(newPath);
        original.SizeBytes.ShouldBe(50);
    }

    [Fact]
    public async Task Process_SaverImageUnderCap_PassesThroughUntouched()
    {
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
        var job = NewJob(photo.Id);
        var compressor = new FakeImageCompressor();

        await NewHandler(new UploadOptions { FreeSaverMaxImageBytes = 200 }, compressor).ProcessJobAsync(job);

        compressor.CallCount.ShouldBe(0);
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.jpg");
        photo.SizeBytes.ShouldBe(100);
        photo.StoredQuality.ShouldBe(UploadQualities.Original);
        photo.State.ShouldBe(PhotoState.Ready);
        job.State.ShouldBe(JobState.Done);
    }

    [Fact]
    public async Task Process_OriginalQuality_NeverCompresses()
    {
        var owner = Owner(uploadQuality: UploadQualities.Original);
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
        var job = NewJob(photo.Id);
        var compressor = new FakeImageCompressor();

        await NewHandler(new UploadOptions { FreeSaverMaxImageBytes = 50 }, compressor).ProcessJobAsync(job);

        compressor.CallCount.ShouldBe(0);
        photo.SizeBytes.ShouldBe(100);
        photo.StoredQuality.ShouldBe(UploadQualities.Original);
    }

    [Fact]
    public async Task Process_SaverCompressionUnreachable_KeepsOriginalAndStillReadies()
    {
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "p.jpg", "image/jpeg", MediaType.Photo, 100);
        var job = NewJob(photo.Id);
        var compressor = new FakeImageCompressor((_, _) =>
            throw new InvalidImageException("The image cannot be compressed below 50 bytes."));

        await NewHandler(new UploadOptions { FreeSaverMaxImageBytes = 50 }, compressor).ProcessJobAsync(job);

        photo.State.ShouldBe(PhotoState.Ready);
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.jpg");
        photo.SizeBytes.ShouldBe(100);
        photo.StoredQuality.ShouldBe(UploadQualities.Original);
        job.State.ShouldBe(JobState.Done);
    }

    [Fact]
    public async Task Process_SaverVideoOverCap_TranscodesWithSaverHeight()
    {
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "clip.mov", "video/quicktime", MediaType.Video, 500);
        var job = NewJob(photo.Id);
        var transcoded = new byte[100];
        var compressor = new FakeVideoCompressor((_, maxBytes, _) => new MemoryStream(transcoded));

        await NewHandler(new UploadOptions { FreeSaverMaxVideoBytes = 100 }, videoCompressor: compressor)
            .ProcessJobAsync(job);

        compressor.CallCount.ShouldBe(1);
        compressor.LastMaxHeight.ShouldBe(1080);

        var newPath = $"{owner.Id}/{photo.Id}/original.mp4";
        photo.OriginalBlobPath.ShouldBe(newPath);
        photo.MimeType.ShouldBe("video/mp4");
        photo.SizeBytes.ShouldBe(100);
        photo.StoredQuality.ShouldBe(UploadQualities.StorageSaver);
        photo.State.ShouldBe(PhotoState.Ready);
        job.State.ShouldBe(JobState.Done);

        _blobs.Blobs.Keys.ShouldContain(newPath);
        _blobs.Blobs.Keys.ShouldNotContain($"{owner.Id}/{photo.Id}/original.mov");
        _variants.Variants.Single(v => v.Kind == VariantKind.Original).Format.ShouldBe("mp4");
    }

    [Fact]
    public async Task Process_SaverVideoUnderHeightCeiling_KeepsResolution()
    {
        var owner = Owner();
        var photo = NewStoredPhoto(owner, "clip.mp4", "video/mp4", MediaType.Video, 500);
        var job = NewJob(photo.Id);
        var compressor = new FakeVideoCompressor((_, maxBytes, _) => new MemoryStream(new byte[maxBytes]));

        await NewHandler(new UploadOptions { FreeSaverMaxVideoBytes = 100, SaverVideoMaxHeight = 720 },
            videoCompressor: compressor).ProcessJobAsync(job);

        compressor.LastMaxHeight.ShouldBe(720);
        photo.StoredQuality.ShouldBe(UploadQualities.StorageSaver);
    }

    private static string Sha256Of(byte[] bytes) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
}
