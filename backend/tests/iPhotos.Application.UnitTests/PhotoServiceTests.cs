using System.Text;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;

namespace iPhotos.Application.UnitTests;

public class PhotoServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantRepository _variants = new();
    private readonly InMemoryVariantJobRepository _jobs = new();
    private readonly FakeBlobStorage _blobs = new();
    private readonly FakeUnitOfWork _uow = new();
    private readonly Sha256ContentHasher _hasher = new();
    private readonly FakeVideoProcessor _video = new();

    private PhotoService NewService(
        UploadOptions? uploadOptions = null,
        IImageCompressor? imageCompressor = null,
        IVideoCompressor? videoCompressor = null) => new(
        _photos, _variants, _jobs, _users, _blobs, _hasher, new FakeImageVariantGenerator(),
        new FakeExifExtractor(), _video,
        imageCompressor ?? new FakeImageCompressor(),
        videoCompressor ?? new FakeVideoCompressor(),
        _uow, new StubDateTimeProvider(Now),
        Microsoft.Extensions.Options.Options.Create(uploadOptions ?? new UploadOptions()));

    private User NewUser(long quota = 1_000_000) =>
        User.Create($"user-{Guid.NewGuid():N}@example.com", "hash", null, quota, Now) is { } user
            ? AddUser(user)
            : throw new InvalidOperationException();

    private User AddUser(User user)
    {
        _users.Users.Add(user);
        return user;
    }

    private static Stream JpegBytes(int size = 100)
    {
        var bytes = new byte[size];
        for (var i = 0; i < size; i++)
        {
            bytes[i] = (byte)(i % 251);
        }

        return new MemoryStream(bytes);
    }

    private static string Sha256Of(byte[] bytes) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();

    private async Task<Photo> UploadAsync(User owner, Stream? content = null, string fileName = "photo.jpg", string contentType = "image/jpeg")
    {
        var result = await NewService().UploadAsync(owner.Id, fileName, contentType, content ?? JpegBytes(), cancellationToken: CancellationToken.None);
        return _photos.Photos.Single(p => p.Id == result.Photo.Id);
    }

    [Fact]
    public async Task Upload_NewPhoto_StoresBlobsCreatesReadyPhotoWithVariants()
    {
        var owner = NewUser();
        var content = JpegBytes(100);

        var result = await NewService().UploadAsync(owner.Id, "vacation.jpg", "image/jpeg", content);

        result.Duplicated.ShouldBeFalse();
        result.Photo.State.ShouldBe(PhotoState.Ready);
        result.Photo.FileName.ShouldBe("vacation.jpg");
        result.Photo.SizeBytes.ShouldBe(100);
        result.Photo.ContentHash.ShouldBe(Sha256Of(((MemoryStream)content).ToArray()));
        result.Photo.Width.ShouldBe(4032);
        result.Photo.Height.ShouldBe(3024);

        // EXIF + preview + thumbnail are generated inline — no variant job, no read-back.
        var photo = _photos.Photos.Single();
        photo.Id.ShouldBe(result.Photo.Id);
        photo.State.ShouldBe(PhotoState.Ready);
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.jpg");
        _blobs.Blobs.Keys.ShouldContain(photo.OriginalBlobPath);
        _blobs.Blobs.Keys.ShouldContain($"{owner.Id}/{photo.Id}/preview.jpg");
        _blobs.Blobs.Keys.ShouldContain($"{owner.Id}/{photo.Id}/thumb.jpg");
        _variants.Variants.Select(v => v.Kind).ShouldBe(
            new[] { VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail });
        _jobs.Jobs.ShouldBeEmpty();
        _uow.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task Upload_SameContentTwice_ReturnsExistingAsDuplicated()
    {
        var owner = NewUser();
        var bytes = ((MemoryStream)JpegBytes(200)).ToArray();

        var first = await NewService().UploadAsync(owner.Id, "one.jpg", "image/jpeg", new MemoryStream(bytes));
        var second = await NewService().UploadAsync(owner.Id, "two.jpg", "image/jpeg", new MemoryStream(bytes));

        second.Duplicated.ShouldBeTrue();
        second.Photo.Id.ShouldBe(first.Photo.Id);
        _photos.Photos.ShouldHaveSingleItem();
        _blobs.Blobs.Count.ShouldBe(3);
        _jobs.Jobs.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("image/heic")]
    [InlineData("text/plain")]
    [InlineData("video/x-flv")]
    public async Task Upload_UnsupportedContentType_Throws(string contentType)
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().UploadAsync(owner.Id, "file", contentType, JpegBytes()));
    }

    // ── Video uploads ────────────────────────────────────────────────────────

    [Fact]
    public async Task Upload_VideoContent_StoresOriginalPosterVariantsAndDuration()
    {
        var owner = NewUser();
        var content = new MemoryStream(Encoding.UTF8.GetBytes("fake-video-bytes"));

        var result = await NewService().UploadAsync(owner.Id, "clip.mp4", "video/mp4", content);

        result.Duplicated.ShouldBeFalse();
        result.Photo.State.ShouldBe(PhotoState.Ready);
        result.Photo.MediaType.ShouldBe(MediaType.Video);
        result.Photo.MimeType.ShouldBe("video/mp4");
        result.Photo.DurationSeconds.ShouldBe(_video.Info.DurationSeconds);
        result.Photo.Width.ShouldBe(1920);
        result.Photo.Height.ShouldBe(1080);

        var photo = _photos.Photos.Single();
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.mp4");
        _blobs.Blobs.Keys.ShouldContain(photo.OriginalBlobPath);
        // Poster feeds the regular pipeline: same preview/thumbnail paths as photos.
        _blobs.Blobs.Keys.ShouldContain($"{owner.Id}/{photo.Id}/preview.jpg");
        _blobs.Blobs.Keys.ShouldContain($"{owner.Id}/{photo.Id}/thumb.jpg");
        var original = _variants.Variants.Single(v => v.Kind == VariantKind.Original);
        original.Format.ShouldBe("mp4");
        _jobs.Jobs.ShouldBeEmpty();
    }

    [Fact]
    public async Task Upload_SameVideoTwice_ReturnsExistingAsDuplicated()
    {
        var owner = NewUser();
        var bytes = Encoding.UTF8.GetBytes("fake-video-bytes");

        var first = await NewService().UploadAsync(owner.Id, "one.mp4", "video/mp4", new MemoryStream(bytes));
        var second = await NewService().UploadAsync(owner.Id, "two.mp4", "video/mp4", new MemoryStream(bytes));

        second.Duplicated.ShouldBeTrue();
        second.Photo.Id.ShouldBe(first.Photo.Id);
        _photos.Photos.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Upload_VideoOverQuota_Throws()
    {
        var owner = NewUser(quota: 5);

        await Should.ThrowAsync<QuotaExceededException>(
            () => NewService().UploadAsync(
                owner.Id, "big.mp4", "video/mp4",
                new MemoryStream(Encoding.UTF8.GetBytes("a-video-much-longer-than-the-quota"))));
    }

    [Fact]
    public async Task Upload_OverQuota_Throws()
    {
        var owner = NewUser(quota: 50);

        await Should.ThrowAsync<QuotaExceededException>(
            () => NewService().UploadAsync(owner.Id, "big.jpg", "image/jpeg", JpegBytes(100)));
    }

    [Fact]
    public async Task Upload_PaidPlanImageOverCap_Throws()
    {
        var owner = NewUser();
        owner.Plan = "paid";

        await Should.ThrowAsync<ValidationException>(
            () => NewService(new UploadOptions { PaidMaxImageBytes = 10 }).UploadAsync(
                owner.Id, "big.jpg", "image/jpeg", JpegBytes(100)));
    }

    [Fact]
    public async Task Upload_FreePlanImageOverCap_IsCompressedToCap()
    {
        var owner = NewUser();
        Stream Compress(Stream image, long maxBytes) => new MemoryStream(new byte[maxBytes]);

        var result = await NewService(
            new UploadOptions { FreeMaxImageBytes = 50 },
            new FakeImageCompressor(Compress)).UploadAsync(
            owner.Id, "big.jpg", "image/jpeg", JpegBytes(100));

        result.Photo.SizeBytes.ShouldBe(50);
    }

    [Fact]
    public async Task Upload_FreePlanVideoOverCap_IsTranscodedToCap()
    {
        var owner = NewUser(quota: 1_000_000);
        Stream Transcode(Stream video, long maxBytes) => new MemoryStream(new byte[maxBytes]);

        var result = await NewService(
            new UploadOptions { FreeMaxVideoBytes = 20 },
            videoCompressor: new FakeVideoCompressor(Transcode)).UploadAsync(
            owner.Id, "clip.mp4", "video/mp4",
            new MemoryStream(Encoding.UTF8.GetBytes("a-video-much-longer-than-the-cap")));

        result.Photo.SizeBytes.ShouldBe(20);
    }

    [Fact]
    public async Task Upload_DedupHappensBeforeQuota_DoesNotConsumeQuotaTwice()
    {
        var owner = NewUser(quota: 150);
        var bytes = ((MemoryStream)JpegBytes(100)).ToArray();

        (await NewService().UploadAsync(owner.Id, "one.jpg", "image/jpeg", new MemoryStream(bytes))).Duplicated.ShouldBeFalse();
        (await NewService().UploadAsync(owner.Id, "two.jpg", "image/jpeg", new MemoryStream(bytes))).Duplicated.ShouldBeTrue();
    }

    [Fact]
    public async Task Upload_EmptyFileName_Throws()
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().UploadAsync(owner.Id, "  ", "image/jpeg", JpegBytes()));
    }

    [Fact]
    public async Task Upload_UnknownOwner_ThrowsNotFound()
    {
        await Should.ThrowAsync<NotFoundException>(
            () => NewService().UploadAsync(Guid.NewGuid(), "x.jpg", "image/jpeg", JpegBytes()));
    }

    [Fact]
    public async Task List_ReturnsOnlyOwnerPhotos_PagedAndOrdered()
    {
        var owner = NewUser();
        var other = NewUser();
        var early = await UploadAsync(owner, JpegBytes(100));
        early.TakenAt = new DateTimeOffset(2024, 6, 1, 0, 0, 0, TimeSpan.Zero);
        var late = await UploadAsync(owner, JpegBytes(120));
        late.TakenAt = new DateTimeOffset(2025, 6, 1, 0, 0, 0, TimeSpan.Zero);
        await UploadAsync(other, JpegBytes(140));

        var page = await NewService().ListAsync(owner.Id, new PhotoFilter(owner.Id, Page: 1, PageSize: 10));

        page.TotalCount.ShouldBe(2);
        page.Items.Count.ShouldBe(2);
        page.Items[0].Id.ShouldBe(late.Id);
        page.Items[1].Id.ShouldBe(early.Id);
    }

    [Fact]
    public async Task Get_WithVariants_ReturnsPhotoDto()
    {
        var owner = NewUser();
        var photo = await UploadAsync(owner);

        var dto = await NewService().GetAsync(owner.Id, photo.Id);

        dto.Id.ShouldBe(photo.Id);
        dto.Variants.Select(v => v.Kind).ShouldBe(
            new[] { VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail });
    }

    [Fact]
    public async Task Get_FromAnotherOwner_ThrowsNotFound()
    {
        var owner = NewUser();
        var intruder = NewUser();
        var photo = await UploadAsync(owner);

        await Should.ThrowAsync<NotFoundException>(() => NewService().GetAsync(intruder.Id, photo.Id));
    }

    [Fact]
    public async Task GetVariantFile_Original_ReturnsOriginalBlob()
    {
        var owner = NewUser();
        var photo = await UploadAsync(owner);

        var file = await NewService().GetVariantFileAsync(owner.Id, photo.Id, VariantKind.Original);

        file.BlobPath.ShouldBe(photo.OriginalBlobPath);
        file.ContentType.ShouldBe("image/jpeg");
        file.SizeBytes.ShouldBe(100);
    }

    [Fact]
    public async Task GetVariantFile_NotGeneratedYet_ThrowsNotFound()
    {
        var owner = NewUser();
        // Ticket flow: the photo waits in PendingProcessing until the worker runs,
        // so the thumbnail variant does not exist yet.
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "later.jpg", "image/jpeg", 300, "hash-1");
        _blobs.Blobs[_photos.Photos.Single().OriginalBlobPath] = [1, 2, 3];
        await NewService().CompleteUploadAsync(owner.Id, ticket.Photo.Id);

        await Should.ThrowAsync<NotFoundException>(
            () => NewService().GetVariantFileAsync(owner.Id, ticket.Photo.Id, VariantKind.Thumbnail));
    }

    [Fact]
    public async Task Delete_RemovesPhotoVariantsAndBlobs()
    {
        var owner = NewUser();
        var photo = await UploadAsync(owner);
        _variants.Variants.Add(PhotoVariant.Create(photo.Id, VariantKind.Thumbnail, $"{owner.Id}/{photo.Id}/thumb.jpg", 10, 5, 50, "jpeg", Now));
        _blobs.Blobs[$"{owner.Id}/{photo.Id}/thumb.jpg"] = [1, 2, 3];

        await NewService().DeleteAsync(owner.Id, photo.Id);

        _photos.Photos.ShouldBeEmpty();
        _variants.Variants.ShouldBeEmpty();
        _blobs.Blobs.ShouldBeEmpty();
    }

    [Fact]
    public async Task Delete_FromAnotherOwner_ThrowsNotFound()
    {
        var owner = NewUser();
        var intruder = NewUser();
        var photo = await UploadAsync(owner);

        await Should.ThrowAsync<NotFoundException>(() => NewService().DeleteAsync(intruder.Id, photo.Id));
    }

    [Fact]
    public async Task GetUsage_SumsBytesAndReturnsQuota()
    {
        var owner = NewUser(quota: 5_000);
        await UploadAsync(owner, JpegBytes(100));
        await UploadAsync(owner, JpegBytes(200));

        var usage = await NewService().GetUsageAsync(owner.Id);

        usage.UsedBytes.ShouldBe(300);
        usage.QuotaBytes.ShouldBe(5_000);
        usage.PhotoCount.ShouldBe(2);
    }

    // ── Upload tickets (direct-to-storage flow) ─────────────────────────────

    [Fact]
    public async Task CreateUploadTicket_NewContent_PersistsPendingUploadAndReturnsPresignedUrl()
    {
        var owner = NewUser();

        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "vacation.jpg", "image/jpeg", 300, "hash-1");

        var photo = _photos.Photos.Single();
        ticket.Duplicated.ShouldBeFalse();
        ticket.Photo.State.ShouldBe(PhotoState.PendingUpload);
        ticket.Photo.Id.ShouldBe(photo.Id);
        ticket.UploadUrl.ShouldNotBeNull();
        ticket.UploadUrl.ShouldContain(Uri.EscapeDataString(photo.OriginalBlobPath));
        ticket.ExpiresAt.ShouldNotBeNull();

        photo.State.ShouldBe(PhotoState.PendingUpload);
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.jpg");
        _blobs.PresignRequests.ShouldHaveSingleItem();
        _blobs.Blobs.ShouldBeEmpty(); // no bytes ever touch the backend on this path
        _jobs.Jobs.ShouldBeEmpty();   // processing is only enqueued on complete
        _uow.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task CreateUploadTicket_KnownHash_ReturnsExistingPhotoWithoutPresign()
    {
        var owner = NewUser();
        await UploadAsync(owner, JpegBytes(100)); // server-side hash = Sha256Of(bytes)

        var hash = Sha256Of(((MemoryStream)JpegBytes(100)).ToArray());
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "copy.jpg", "image/jpeg", 100, hash);

        ticket.Duplicated.ShouldBeTrue();
        ticket.UploadUrl.ShouldBeNull();
        _photos.Photos.ShouldHaveSingleItem();
        _blobs.PresignRequests.ShouldBeEmpty();
        _jobs.Jobs.ShouldBeEmpty(); // UploadAsync no longer enqueues jobs
    }

    [Fact]
    public async Task CreateUploadTicket_PendingUploadsReserveQuota()
    {
        var owner = NewUser(quota: 1_000);

        await NewService().CreateUploadTicketAsync(owner.Id, "one.jpg", "image/jpeg", 600, "hash-1");

        await Should.ThrowAsync<QuotaExceededException>(
            () => NewService().CreateUploadTicketAsync(owner.Id, "two.jpg", "image/jpeg", 500, "hash-2"));
    }

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("image/heic")]
    [InlineData("video/x-flv")]
    public async Task CreateUploadTicket_UnsupportedContentType_Throws(string contentType)
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().CreateUploadTicketAsync(owner.Id, "file", contentType, 100, "hash-1"));
    }

    [Fact]
    public async Task CreateUploadTicket_VideoContent_ReservesQuotaAndPresigns()
    {
        var owner = NewUser();

        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "clip.mp4", "video/mp4", 500, "hash-v1");

        ticket.Duplicated.ShouldBeFalse();
        ticket.Photo.MediaType.ShouldBe(MediaType.Video);
        ticket.UploadUrl.ShouldNotBeNull();
        _photos.Photos.Single().MediaType.ShouldBe(MediaType.Video);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task CreateUploadTicket_NonPositiveSize_Throws(long sizeBytes)
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().CreateUploadTicketAsync(owner.Id, "x.jpg", "image/jpeg", sizeBytes, "hash-1"));
    }

    [Fact]
    public async Task CreateUploadTicket_MissingHash_Throws()
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().CreateUploadTicketAsync(owner.Id, "x.jpg", "image/jpeg", 100, " "));
    }

    [Fact]
    public async Task CreateUploadTicket_StorageCannotPresign_ThrowsWithoutPersisting()
    {
        var owner = NewUser();
        _blobs.UploadUrl = null;

        await Should.ThrowAsync<NotSupportedException>(
            () => NewService().CreateUploadTicketAsync(owner.Id, "x.jpg", "image/jpeg", 100, "hash-1"));

        _photos.Photos.ShouldBeEmpty();
        _uow.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task CompleteUpload_BytesInStorage_MovesToPendingProcessingAndEnqueuesJob()
    {
        var owner = NewUser();
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "vacation.jpg", "image/jpeg", 300, "hash-1");
        _blobs.Blobs[_photos.Photos.Single().OriginalBlobPath] = [1, 2, 3]; // simulates the client's presigned PUT

        var dto = await NewService().CompleteUploadAsync(owner.Id, ticket.Photo.Id);

        dto.State.ShouldBe(PhotoState.PendingProcessing);
        _photos.Photos.Single().State.ShouldBe(PhotoState.PendingProcessing);
        _jobs.Jobs.ShouldHaveSingleItem();
        _jobs.Jobs.Single().PhotoId.ShouldBe(ticket.Photo.Id);
    }

    [Fact]
    public async Task CompleteUpload_BeforeAnyUpload_ThrowsNotFound()
    {
        var owner = NewUser();
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "vacation.jpg", "image/jpeg", 300, "hash-1");

        await Should.ThrowAsync<NotFoundException>(
            () => NewService().CompleteUploadAsync(owner.Id, ticket.Photo.Id));

        // Still pending — the client may retry the PUT and complete later.
        _photos.Photos.Single().State.ShouldBe(PhotoState.PendingUpload);
        _jobs.Jobs.ShouldBeEmpty();
    }

    [Fact]
    public async Task CompleteUpload_Twice_ThrowsValidation()
    {
        var owner = NewUser();
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "vacation.jpg", "image/jpeg", 300, "hash-1");
        _blobs.Blobs[_photos.Photos.Single().OriginalBlobPath] = [1, 2, 3];
        await NewService().CompleteUploadAsync(owner.Id, ticket.Photo.Id);

        await Should.ThrowAsync<ValidationException>(
            () => NewService().CompleteUploadAsync(owner.Id, ticket.Photo.Id));
    }

    [Fact]
    public async Task CompleteUpload_FromAnotherOwner_ThrowsNotFound()
    {
        var owner = NewUser();
        var intruder = NewUser();
        var ticket = await NewService().CreateUploadTicketAsync(owner.Id, "vacation.jpg", "image/jpeg", 300, "hash-1");
        _blobs.Blobs[_photos.Photos.Single().OriginalBlobPath] = [1, 2, 3];

        await Should.ThrowAsync<NotFoundException>(
            () => NewService().CompleteUploadAsync(intruder.Id, ticket.Photo.Id));
    }
}
