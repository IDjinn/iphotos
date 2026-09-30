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

    private PhotoService NewService() => new(
        _photos, _variants, _jobs, _users, _blobs, _hasher, _uow, new StubDateTimeProvider(Now));

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
        var result = await NewService().UploadAsync(owner.Id, fileName, contentType, content ?? JpegBytes(), CancellationToken.None);
        return _photos.Photos.Single(p => p.Id == result.Photo.Id);
    }

    [Fact]
    public async Task Upload_NewPhoto_StoresBlobCreatesPhotoAndEnqueuesJob()
    {
        var owner = NewUser();
        var content = JpegBytes(100);

        var result = await NewService().UploadAsync(owner.Id, "vacation.jpg", "image/jpeg", content);

        result.Duplicated.ShouldBeFalse();
        result.Photo.State.ShouldBe(PhotoState.PendingProcessing);
        result.Photo.FileName.ShouldBe("vacation.jpg");
        result.Photo.SizeBytes.ShouldBe(100);
        result.Photo.ContentHash.ShouldBe(Sha256Of(((MemoryStream)content).ToArray()));

        var photo = _photos.Photos.Single();
        photo.Id.ShouldBe(result.Photo.Id);
        photo.OriginalBlobPath.ShouldBe($"{owner.Id}/{photo.Id}/original.jpg");
        _blobs.Blobs.Keys.ShouldContain(photo.OriginalBlobPath);
        _jobs.Jobs.ShouldHaveSingleItem();
        _jobs.Jobs.Single().PhotoId.ShouldBe(photo.Id);
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
        _blobs.Blobs.Count.ShouldBe(1);
        _jobs.Jobs.ShouldHaveSingleItem();
    }

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("image/heic")]
    [InlineData("text/plain")]
    public async Task Upload_UnsupportedContentType_Throws(string contentType)
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().UploadAsync(owner.Id, "file", contentType, JpegBytes()));
    }

    [Fact]
    public async Task Upload_OverQuota_Throws()
    {
        var owner = NewUser(quota: 50);

        await Should.ThrowAsync<QuotaExceededException>(
            () => NewService().UploadAsync(owner.Id, "big.jpg", "image/jpeg", JpegBytes(100)));
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
        _variants.Variants.Add(PhotoVariant.Create(photo.Id, VariantKind.Thumbnail, "t.jpg", 10, 5, 50, "jpeg", Now));

        var dto = await NewService().GetAsync(owner.Id, photo.Id);

        dto.Id.ShouldBe(photo.Id);
        dto.Variants.ShouldHaveSingleItem();
        dto.Variants.Single().Kind.ShouldBe(VariantKind.Thumbnail);
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
        var photo = await UploadAsync(owner);

        await Should.ThrowAsync<NotFoundException>(
            () => NewService().GetVariantFileAsync(owner.Id, photo.Id, VariantKind.Thumbnail));
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
}
