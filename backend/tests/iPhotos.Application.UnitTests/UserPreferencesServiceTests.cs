using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;

namespace iPhotos.Application.UnitTests;

public class UserPreferencesServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantJobRepository _jobs = new();
    private readonly FakeUnitOfWork _uow = new();

    private UserPreferencesService NewService(UploadOptions? uploadOptions = null) => new(
        _photos, _users, _jobs, _uow, new StubDateTimeProvider(Now),
        Microsoft.Extensions.Options.Options.Create(uploadOptions ?? new UploadOptions()));

    private User NewUser(string uploadQuality = UploadQualities.Original, string plan = "free")
    {
        var user = User.Create($"user-{Guid.NewGuid():N}@example.com", "hash", null, 1_000_000, Now);
        user.Plan = plan;
        user.UploadQuality = uploadQuality;
        _users.Users.Add(user);
        return user;
    }

    private Photo NewReadyPhoto(User owner, MediaType mediaType, long sizeBytes, string storedQuality = UploadQualities.Original)
    {
        var photo = Photo.Create(owner.Id, $"hash-{Guid.NewGuid():N}", "p.jpg", "image/jpeg", sizeBytes, Now, mediaType);
        photo.State = PhotoState.Ready;
        photo.StoredQuality = storedQuality;
        _photos.Photos.Add(photo);
        return photo;
    }

    [Fact]
    public async Task Get_ReturnsQualityAndEffectiveCaps()
    {
        var paid = NewUser(uploadQuality: UploadQualities.Original, plan: "iphotos.cloud.1tb.monthly");

        var dto = await NewService().GetAsync(paid.Id);

        dto.UploadQuality.ShouldBe(UploadQualities.Original);
        dto.ImageCapBytes.ShouldBe(new UploadOptions().PaidOriginalMaxImageBytes);
        dto.VideoCapBytes.ShouldBe(new UploadOptions().PaidOriginalMaxVideoBytes);
    }

    [Fact]
    public async Task Get_UnknownUser_ThrowsNotFound()
    {
        await Should.ThrowAsync<NotFoundException>(() => NewService().GetAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task Get_SaverQuality_CountsActionableMismatches()
    {
        var owner = NewUser(uploadQuality: UploadQualities.StorageSaver);
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 500);
        NewReadyPhoto(owner, MediaType.Video, sizeBytes: 500);
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 100); // under the cap — compliant
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 900, storedQuality: UploadQualities.StorageSaver); // already saver

        var dto = await NewService(new UploadOptions { FreeSaverMaxImageBytes = 200, FreeSaverMaxVideoBytes = 200 })
            .GetAsync(owner.Id);

        dto.MismatchedPhotoCount.ShouldBe(2);
    }

    [Fact]
    public async Task Update_InvalidQuality_Throws()
    {
        var owner = NewUser();

        await Should.ThrowAsync<ValidationException>(
            () => NewService().UpdateAsync(owner.Id, new UpdateUserPreferencesRequest("ultra")));
    }

    [Fact]
    public async Task Update_WithoutApply_CountsButDoesNotEnqueue()
    {
        var owner = NewUser(uploadQuality: UploadQualities.StorageSaver);
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 500);

        var dto = await NewService(new UploadOptions { FreeSaverMaxImageBytes = 200 })
            .UpdateAsync(owner.Id, new UpdateUserPreferencesRequest(UploadQualities.StorageSaver, ApplyToExisting: false));

        _jobs.Jobs.ShouldBeEmpty();
        dto.MismatchedPhotoCount.ShouldBe(1);
    }

    [Fact]
    public async Task Update_ToSaverWithApply_EnqueuesJobsForMismatches()
    {
        var owner = NewUser(uploadQuality: UploadQualities.Original);
        var big = NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 500);
        var small = NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 100);

        var dto = await NewService(new UploadOptions { FreeSaverMaxImageBytes = 200 })
            .UpdateAsync(owner.Id, new UpdateUserPreferencesRequest(UploadQualities.StorageSaver, ApplyToExisting: true));

        owner.UploadQuality.ShouldBe(UploadQualities.StorageSaver);
        _jobs.Jobs.Select(j => j.PhotoId).ShouldBe([big.Id]);
        dto.MismatchedPhotoCount.ShouldBe(1);
        dto.UploadQuality.ShouldBe(UploadQualities.StorageSaver);
    }

    [Fact]
    public async Task Update_ToSaverWithoutApply_CountsButDoesNotEnqueue()
    {
        var owner = NewUser(uploadQuality: UploadQualities.Original);
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 500);

        var dto = await NewService(new UploadOptions { FreeSaverMaxImageBytes = 200 })
            .UpdateAsync(owner.Id, new UpdateUserPreferencesRequest(UploadQualities.StorageSaver, ApplyToExisting: false));

        _jobs.Jobs.ShouldBeEmpty();
        dto.MismatchedPhotoCount.ShouldBe(1);
    }

    [Fact]
    public async Task Update_ToOriginal_ReportsNoActionableMismatches()
    {
        var owner = NewUser(uploadQuality: UploadQualities.StorageSaver);
        NewReadyPhoto(owner, MediaType.Photo, sizeBytes: 500, storedQuality: UploadQualities.StorageSaver);

        var dto = await NewService().UpdateAsync(owner.Id, new UpdateUserPreferencesRequest(UploadQualities.Original));

        // Compressed bytes are final — there is nothing the worker could rewrite.
        dto.MismatchedPhotoCount.ShouldBe(0);
        _jobs.Jobs.ShouldBeEmpty();
    }
}
