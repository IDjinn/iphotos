using iPhotos.Domain;

namespace iPhotos.Domain.UnitTests;

public class PhotoTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static Photo NewPhoto()
    {
        var photo = Photo.Create(Guid.NewGuid(), "abc123", "photo.jpg", "image/jpeg", 1024, Now);
        photo.OriginalBlobPath = "owner/photo.jpg";
        return photo;
    }

    [Fact]
    public void Create_StartsPendingProcessing()
    {
        var photo = NewPhoto();

        photo.Id.ShouldNotBe(Guid.Empty);
        photo.ContentHash.ShouldBe("abc123");
        photo.FileName.ShouldBe("photo.jpg");
        photo.MimeType.ShouldBe("image/jpeg");
        photo.SizeBytes.ShouldBe(1024);
        photo.OriginalBlobPath.ShouldBe("owner/photo.jpg");
        photo.State.ShouldBe(PhotoState.PendingProcessing);
        photo.CreatedAt.ShouldBe(Now);
        photo.UpdatedAt.ShouldBe(Now);
        photo.Width.ShouldBeNull();
        photo.TakenAt.ShouldBeNull();
    }

    [Fact]
    public void MarkProcessing_FromPending_Succeeds()
    {
        var photo = NewPhoto();

        photo.MarkProcessing(Now.AddSeconds(1));

        photo.State.ShouldBe(PhotoState.Processing);
    }

    [Fact]
    public void MarkProcessing_FromFailed_Succeeds_AllowingRetry()
    {
        var photo = NewPhoto();
        photo.MarkProcessing(Now);
        photo.MarkFailed("boom", Now);

        photo.MarkProcessing(Now.AddMinutes(1));

        photo.State.ShouldBe(PhotoState.Processing);
    }

    [Fact]
    public void MarkProcessing_FromReady_Throws()
    {
        var photo = NewPhoto();
        photo.MarkProcessing(Now);
        photo.MarkReady(new PhotoMetadata(100, 50, null, null, null, null, null), Now);

        Should.Throw<InvalidOperationException>(() => photo.MarkProcessing(Now));
    }

    [Fact]
    public void MarkProcessing_FromProcessing_Throws()
    {
        var photo = NewPhoto();
        photo.MarkProcessing(Now);

        Should.Throw<InvalidOperationException>(() => photo.MarkProcessing(Now));
    }

    [Fact]
    public void MarkReady_FromProcessing_SetsIndexedMetadata()
    {
        var photo = NewPhoto();
        photo.MarkProcessing(Now);
        var takenAt = new DateTimeOffset(2025, 12, 25, 10, 30, 0, TimeSpan.Zero);
        var metadata = new PhotoMetadata(
            Width: 4032, Height: 3024, TakenAt: takenAt,
            CameraMake: "Google", CameraModel: "Pixel 9",
            GpsLatitude: -22.9, GpsLongitude: -43.2);

        photo.MarkReady(metadata, Now.AddSeconds(5));

        photo.State.ShouldBe(PhotoState.Ready);
        photo.Width.ShouldBe(4032);
        photo.Height.ShouldBe(3024);
        photo.TakenAt.ShouldBe(takenAt);
        photo.CameraMake.ShouldBe("Google");
        photo.CameraModel.ShouldBe("Pixel 9");
        photo.GpsLatitude.ShouldBe(-22.9);
        photo.GpsLongitude.ShouldBe(-43.2);
        photo.LastError.ShouldBeNull();
    }

    [Fact]
    public void MarkReady_WithoutProcessing_Throws()
    {
        var photo = NewPhoto();

        Should.Throw<InvalidOperationException>(
            () => photo.MarkReady(new PhotoMetadata(1, 1, null, null, null, null, null), Now));
    }

    [Fact]
    public void MarkFailed_FromProcessing_RecordsError()
    {
        var photo = NewPhoto();
        photo.MarkProcessing(Now);

        photo.MarkFailed("corrupt image", Now.AddSeconds(5));

        photo.State.ShouldBe(PhotoState.Failed);
        photo.LastError.ShouldBe("corrupt image");
    }

    // ── Direct-upload lifecycle (PendingUpload) ─────────────────────────────

    [Fact]
    public void CreatePendingUpload_StartsInPendingUpload()
    {
        var photo = Photo.CreatePendingUpload(Guid.NewGuid(), "abc123", "photo.jpg", "image/jpeg", 2048, Now);

        photo.State.ShouldBe(PhotoState.PendingUpload);
        photo.SizeBytes.ShouldBe(2048);
        photo.OriginalBlobPath.ShouldBeEmpty();
    }

    [Fact]
    public void MarkUploadedForProcessing_FromPendingUpload_MovesToPendingProcessing()
    {
        var photo = Photo.CreatePendingUpload(Guid.NewGuid(), "abc123", "photo.jpg", "image/jpeg", 1024, Now);

        photo.MarkUploadedForProcessing(Now.AddSeconds(3));

        photo.State.ShouldBe(PhotoState.PendingProcessing);
    }

    [Fact]
    public void MarkUploadedForProcessing_FromOtherStates_Throws()
    {
        var photo = NewPhoto();

        Should.Throw<InvalidOperationException>(() => photo.MarkUploadedForProcessing(Now));

        photo.MarkProcessing(Now);
        Should.Throw<InvalidOperationException>(() => photo.MarkUploadedForProcessing(Now));
    }

    [Fact]
    public void PendingUpload_PhotoRejectsWorkerTransitions_UntilConfirmed()
    {
        var photo = Photo.CreatePendingUpload(Guid.NewGuid(), "abc123", "photo.jpg", "image/jpeg", 1024, Now);

        Should.Throw<InvalidOperationException>(() => photo.MarkProcessing(Now));
        Should.Throw<InvalidOperationException>(
            () => photo.MarkReady(new PhotoMetadata(1, 1, null, null, null, null, null), Now));
    }
}
