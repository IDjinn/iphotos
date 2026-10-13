using iPhotos.Application;
using iPhotos.Domain;
using iPhotos.Infrastructure;
using iPhotos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace iPhotos.Core.IntegrationTests;

[Collection("postgres")]
public sealed class RepositoriesTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static User NewUser() => User.Create($"u-{Guid.NewGuid():N}@test.com", "hash", null, 1_000_000, Now);

    private static Photo NewPhoto(User owner, DateTimeOffset? takenAt = null, string fileName = "p.jpg")
    {
        var photo = Photo.Create(owner.Id, Guid.NewGuid().ToString("N"), fileName, "image/jpeg", 100, Now);
        photo.TakenAt = takenAt;
        photo.OriginalBlobPath = $"{owner.Id}/{photo.Id}/original.jpg";
        return photo;
    }

    [Fact]
    public async Task Migrations_CreateSchema_AndPersistRoundtrip()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);

        var user = NewUser();
        db.Users.Add(user);
        var photo = NewPhoto(user);
        db.Photos.Add(photo);
        db.PhotoVariants.Add(PhotoVariant.Create(photo.Id, VariantKind.Thumbnail, "t.jpg", 10, 5, 50, "jpeg", Now));
        db.VariantJobs.Add(VariantJob.Create(photo.Id, Now));
        await db.SaveChangesAsync();

        db.ChangeTracker.Clear();
        var loaded = await db.Photos.AsNoTracking().FirstAsync(p => p.Id == photo.Id);
        var variants = await db.PhotoVariants.AsNoTracking().Where(v => v.PhotoId == photo.Id).ToListAsync();
        loaded.State.ShouldBe(PhotoState.PendingProcessing);
        variants.ShouldHaveSingleItem();
        (await db.VariantJobs.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task PhotoRepository_DuplicateOwnerContentHash_ViolatesUniqueConstraint()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var first = Photo.Create(user.Id, "same-hash", "a.jpg", "image/jpeg", 10, Now);
        first.OriginalBlobPath = "a";
        db.Photos.Add(first);
        await db.SaveChangesAsync();

        var second = Photo.Create(user.Id, "same-hash", "b.jpg", "image/jpeg", 20, Now);
        second.OriginalBlobPath = "b";
        db.Photos.Add(second);
        await Should.ThrowAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task PhotoRepository_SameHashDifferentOwners_IsAllowed()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var userA = NewUser();
        var userB = NewUser();
        db.Users.AddRange(userA, userB);
        await db.SaveChangesAsync();

        var a = Photo.Create(userA.Id, "shared-hash", "a.jpg", "image/jpeg", 10, Now);
        a.OriginalBlobPath = "a";
        var b = Photo.Create(userB.Id, "shared-hash", "b.jpg", "image/jpeg", 10, Now);
        b.OriginalBlobPath = "b";
        db.Photos.AddRange(a, b);

        await db.SaveChangesAsync();

        (await db.Photos.CountAsync()).ShouldBe(2);
    }

    [Fact]
    public async Task PhotoRepository_List_OrdersTakenAtDescNullsLast()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var noExif = NewPhoto(user, takenAt: null);
        var oldest = NewPhoto(user, takenAt: new DateTimeOffset(2023, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var newest = NewPhoto(user, takenAt: new DateTimeOffset(2025, 6, 1, 0, 0, 0, TimeSpan.Zero));
        db.Photos.AddRange(newest, noExif, oldest);
        await db.SaveChangesAsync();

        var repository = new PhotoRepository(db);
        var page = await repository.ListAsync(new PhotoFilter(user.Id, Page: 1, PageSize: 10));

        page.Items.Select(p => p.Id).ShouldBe([newest.Id, oldest.Id, noExif.Id]);
    }

    [Fact]
    public async Task PhotoRepository_ListMonthBuckets_GroupsByTakenAtUndatedLast()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        var other = NewUser();
        db.Users.AddRange(user, other);
        await db.SaveChangesAsync();

        var undated = NewPhoto(user, takenAt: null);
        var jan = NewPhoto(user, takenAt: new DateTimeOffset(2025, 1, 15, 0, 0, 0, TimeSpan.Zero));
        var jun1 = NewPhoto(user, takenAt: new DateTimeOffset(2025, 6, 1, 0, 0, 0, TimeSpan.Zero));
        var jun2 = NewPhoto(user, takenAt: new DateTimeOffset(2025, 6, 20, 0, 0, 0, TimeSpan.Zero));
        var video = NewPhoto(user, takenAt: new DateTimeOffset(2025, 6, 10, 0, 0, 0, TimeSpan.Zero));
        video.MediaType = MediaType.Video;
        var foreign = NewPhoto(other, takenAt: new DateTimeOffset(2025, 6, 5, 0, 0, 0, TimeSpan.Zero));
        db.Photos.AddRange(undated, jan, jun1, jun2, video, foreign);
        await db.SaveChangesAsync();

        var repository = new PhotoRepository(db);

        var buckets = await repository.ListMonthBucketsAsync(user.Id, sortBy: null, mediaType: null);
        buckets.Select(b => (b.Month, b.Count))
            .ShouldBe([("2025-06", 3), ("2025-01", 1), ("", 1)]);

        var videosOnly = await repository.ListMonthBucketsAsync(user.Id, sortBy: null, mediaType: MediaType.Video);
        videosOnly.Select(b => (b.Month, b.Count)).ShouldBe([("2025-06", 1)]);

        var byCreated = await repository.ListMonthBucketsAsync(user.Id, sortBy: "createdAt", mediaType: null);
        byCreated.Select(b => (b.Month, b.Count)).ShouldBe([("2026-01", 5)]);
    }

    [Fact]
    public async Task PhotoRepository_List_FiltersByFileNameAndCamera()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var beach = NewPhoto(user, fileName: "beach-2024.jpg");
        var receipt = NewPhoto(user, fileName: "receipt.pdf.jpg");
        receipt.CameraModel = "Pixel 9";
        db.Photos.AddRange(beach, receipt);
        await db.SaveChangesAsync();

        var repository = new PhotoRepository(db);

        var byName = await repository.ListAsync(new PhotoFilter(user.Id, FileName: "BEACH", Page: 1, PageSize: 10));
        byName.TotalCount.ShouldBe(1);
        byName.Items.Single().Id.ShouldBe(beach.Id);

        var byCamera = await repository.ListAsync(new PhotoFilter(user.Id, Camera: "pixel", Page: 1, PageSize: 10));
        byCamera.TotalCount.ShouldBe(1);
        byCamera.Items.Single().Id.ShouldBe(receipt.Id);
    }

    [Fact]
    public async Task VariantJobRepository_Dequeue_ClaimsOldestQueued_ThenEmpty()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var photo1 = NewPhoto(user);
        var photo2 = NewPhoto(user);
        db.Photos.AddRange(photo1, photo2);
        await db.SaveChangesAsync();

        // Enqueue photo2 first (older created_at wins).
        var repository = new VariantJobRepository(db);
        await repository.EnqueueAsync(photo2.Id);
        await Task.Delay(10);
        await repository.EnqueueAsync(photo1.Id);

        var first = await repository.DequeueNextAsync();
        first.ShouldNotBeNull();
        first.PhotoId.ShouldBe(photo2.Id);
        first.State.ShouldBe(JobState.Processing);

        var second = await repository.DequeueNextAsync();
        second.ShouldNotBeNull();
        second.PhotoId.ShouldBe(photo1.Id);

        (await repository.DequeueNextAsync()).ShouldBeNull();
    }

    [Fact]
    public async Task PhotoRepository_GetUsage_SumsOriginalsAndDerivedVariants()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var photo = NewPhoto(user);
        db.Photos.Add(photo);
        db.PhotoVariants.AddRange(
            PhotoVariant.Create(photo.Id, VariantKind.Original, "o", 640, 200, 100, "jpeg", Now),
            PhotoVariant.Create(photo.Id, VariantKind.Preview, "p", 320, 100, 60, "jpeg", Now),
            PhotoVariant.Create(photo.Id, VariantKind.Thumbnail, "t", 64, 20, 20, "jpeg", Now));
        await db.SaveChangesAsync();

        var repository = new PhotoRepository(db);
        var usage = await repository.GetUsageAsync(user.Id);

        // 100 (original blob) + 60 (preview) + 20 (thumb); the Original variant row is the same blob.
        usage.UsedBytes.ShouldBe(180);
        usage.PhotoCount.ShouldBe(1);
        usage.VariantCount.ShouldBe(3);
    }

    [Fact]
    public async Task UserRepository_Roundtrip()
    {
        await using var db = await TestDatabase.CreateAsync(fixture);
        var repository = new UserRepository(db);

        var user = await repository.AddAsync(NewUser());

        var byEmail = await repository.GetByEmailAsync(user.Email);
        byEmail.ShouldNotBeNull();
        byEmail.Id.ShouldBe(user.Id);

        (await repository.GetByEmailAsync("missing@test.com")).ShouldBeNull();
    }

    /// <summary>512-d unit vector with the cosine of (first, second) in the first
    /// two axes — centroids live in vector(512) columns, so tests need the full width.</summary>
    private static float[] Unit512(float first, float second)
    {
        var norm = MathF.Sqrt(first * first + second * second);
        var vector = new float[512];
        vector[0] = first / norm;
        vector[1] = second / norm;
        return vector;
    }

    [Fact]
    public async Task PersonRepository_PageSimilarForOwnerAsync_RanksByCentroidSimilarity()
    {
        // The pgvector raw-SQL ranking behind the "merge several groups at once"
        // sheet (doc 18 §7.3): closest first, floor-filtered, owner-scoped.
        await using var db = await TestDatabase.CreateAsync(fixture);
        var user = NewUser();
        db.Users.Add(user);

        var alice = Person.Create(user.Id, Now);
        alice.Name = "Alice";
        alice.Centroid = Unit512(1, 0);
        alice.FaceCount = 10;
        db.Persons.Add(alice);

        var close = Person.Create(user.Id, Now);
        close.Centroid = Unit512(0.97f, 0.24f);
        close.FaceCount = 4;
        db.Persons.Add(close);

        var far = Person.Create(user.Id, Now);
        far.Centroid = Unit512(0, 1);
        far.FaceCount = 6;
        db.Persons.Add(far);

        var foreignUser = NewUser();
        db.Users.Add(foreignUser);
        var foreign = Person.Create(foreignUser.Id, Now);
        foreign.Centroid = Unit512(1, 0);
        foreign.FaceCount = 3;
        db.Persons.Add(foreign);

        await db.SaveChangesAsync();

        var repository = new PersonRepository(db);
        var page = await repository.PageSimilarForOwnerAsync(
            user.Id, alice.Id, alice.Centroid!, minSimilarity: 0.4f, page: 1, pageSize: 10);

        page.TotalCount.ShouldBe(1);
        var similar = page.Items.ShouldHaveSingleItem();
        similar.Id.ShouldBe(close.Id);
        similar.Similarity.ShouldBeGreaterThanOrEqualTo(0.9f);
        similar.CoverFaceId.ShouldBeNull();
    }
}
