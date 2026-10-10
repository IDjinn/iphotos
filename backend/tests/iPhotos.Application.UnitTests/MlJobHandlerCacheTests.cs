using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.UnitTests;

/// <summary>
/// Faces/labels jobs consume the ML input cache staged by the pipeline (doc 18 §6.2):
/// a cache hit must serve the job without any blob download, a miss falls back to blob
/// storage, and a successful job drops its staged input.
/// </summary>
public class MlJobHandlerCacheTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantRepository _variants = new();
    private readonly InMemoryUserRepository _users = new();
    private readonly FakeBlobStorage _blobs = new();
    private readonly FakeUnitOfWork _uow = new();
    private readonly InMemoryMlJobRepository _jobs = new();
    private readonly InMemoryFaceRepository _faces = new();
    private readonly InMemoryPersonRepository _persons = new();
    private readonly InMemoryPhotoLabelRepository _labels = new();
    private readonly InMemoryMlInputCache _inputCache = new();

    [Fact]
    public async Task Faces_CacheHit_ProcessesWithoutBlobDownloadAndDropsCache()
    {
        var photo = NewReadyPhoto();
        // Only the cache is populated — the blob storage has no preview, so any
        // download attempt would throw and fail the job.
        _inputCache.Entries[(photo.Id, MlInputKind.Preview)] = [1, 2, 3];
        var job = NewJob(photo.Id, MlJobKind.Faces);
        var handler = NewFacesHandler(new FakeFaceProvider(NewDetection()));

        await handler.ProcessJobAsync(job);

        job.State.ShouldBe(MlJobState.Done);
        _faces.Faces.ShouldHaveSingleItem();
        _inputCache.Entries.ShouldBeEmpty();
        _jobs.Jobs.ShouldContain(j => j.Kind == MlJobKind.Cluster);
    }

    [Fact]
    public async Task Faces_CacheMiss_FallsBackToBlobDownload()
    {
        var photo = NewReadyPhoto();
        _blobs.Blobs[BlobPaths.Preview(photo.OwnerId, photo.Id)] = [1, 2, 3];
        var job = NewJob(photo.Id, MlJobKind.Faces);
        var handler = NewFacesHandler(new FakeFaceProvider());

        await handler.ProcessJobAsync(job);

        job.State.ShouldBe(MlJobState.Done);
        _faces.Faces.ShouldBeEmpty();
    }

    [Fact]
    public async Task Labels_CacheHit_ProcessesWithoutBlobDownloadAndDropsCache()
    {
        var photo = NewReadyPhoto();
        _inputCache.Entries[(photo.Id, MlInputKind.Thumbnail)] = [1, 2, 3];
        var job = NewJob(photo.Id, MlJobKind.Labels);
        var handler = NewLabelsHandler(new FakeVisionLabeler(new LabelResult("beach", 0.9f)));

        await handler.ProcessJobAsync(job);

        job.State.ShouldBe(MlJobState.Done);
        _labels.ByPhoto[photo.Id].ShouldContain(l => l.Label == "beach");
        _inputCache.Entries.ShouldBeEmpty();
    }

    [Fact]
    public async Task Labels_CacheMiss_FallsBackToBlobDownload()
    {
        var photo = NewReadyPhoto();
        _blobs.Blobs[BlobPaths.Thumbnail(photo.OwnerId, photo.Id)] = [1, 2, 3];
        var job = NewJob(photo.Id, MlJobKind.Labels);
        var handler = NewLabelsHandler(new FakeVisionLabeler(new LabelResult("beach", 0.9f)));

        await handler.ProcessJobAsync(job);

        job.State.ShouldBe(MlJobState.Done);
        _labels.ByPhoto[photo.Id].ShouldContain(l => l.Label == "beach");
    }

    private FaceProcessingService NewFacesHandler(FakeFaceProvider provider) => new(
        _photos, _variants, provider, new FakeFaceCropper(), new ChineseWhispersClusterer(),
        _faces, _persons, _jobs, _blobs, _inputCache, _uow, new StubDateTimeProvider(Now),
        Options.Create(new MlOptions()), NullLogger<FaceProcessingService>.Instance);

    private LabelProcessingService NewLabelsHandler(FakeVisionLabeler labeler) => new(
        _photos, _variants, labeler, _labels, _blobs, _inputCache, _uow,
        new StubDateTimeProvider(Now),
        Options.Create(new VisionOptions { BaseUrl = "http://vision.test", Model = "test-model" }),
        NullLogger<LabelProcessingService>.Instance);

    private Photo NewReadyPhoto()
    {
        var owner = User.Create($"owner-{Guid.NewGuid():N}@example.com", "hash", null, 1_000_000, Now);
        _users.Users.Add(owner);
        var photo = Photo.Create(owner.Id, $"hash-{Guid.NewGuid():N}", "p.jpg", "image/jpeg", 100, Now);
        photo.OriginalBlobPath = BlobPaths.Original(owner.Id, photo.Id, "p.jpg");
        photo.MarkProcessing(Now);
        photo.MarkReady(new PhotoMetadata(100, 100, null, null, null, null, null), Now);
        _photos.Photos.Add(photo);
        return photo;
    }

    private static MlJob NewJob(Guid photoId, MlJobKind kind)
    {
        var job = MlJob.Create(Guid.NewGuid(), photoId, kind, Now);
        job.Start();
        return job;
    }

    private static DetectedFace NewDetection() =>
        new(10, 10, 100, 100, 0.9f, Enumerable.Repeat(1f / 22, 512).ToArray());

    private sealed class FakeFaceProvider(params DetectedFace[] detections) : IFaceInferenceProvider
    {
        public Task<IReadOnlyList<DetectedFace>> DetectAsync(Stream image, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<DetectedFace>>(detections);
    }

    private sealed class FakeFaceCropper : IFaceCropper
    {
        public Task<Stream> CropAsync(
            Stream image, float x, float y, float width, float height, int longEdge,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream>(new MemoryStream([1, 2, 3]));
    }

    private sealed class FakeVisionLabeler(params LabelResult[] results) : IVisionLabeler
    {
        public Task<IReadOnlyList<LabelResult>> ClassifyAsync(Stream image, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LabelResult>>(results);
    }

    private sealed class InMemoryFaceRepository : IFaceRepository
    {
        public List<PhotoFace> Faces { get; } = [];

        public Task AddRangeAsync(IReadOnlyList<PhotoFace> faces, CancellationToken cancellationToken = default)
        {
            Faces.AddRange(faces);
            return Task.CompletedTask;
        }

        public Task<PhotoFace?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
            Task.FromResult(Faces.FirstOrDefault(f => f.Id == id));

        public Task<IReadOnlyList<PhotoFace>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<PhotoFace>>(Faces.Where(f => f.PhotoId == photoId).ToList());

        public Task<IReadOnlyList<PhotoFace>> ListForOwnerAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<PhotoFace>>(Faces.Where(f => f.OwnerId == ownerId).ToList());

        public Task<IReadOnlyList<PhotoFace>> ListForPersonAsync(
            Guid ownerId, Guid personId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<PhotoFace>>(Faces.Where(f => f.OwnerId == ownerId && f.PersonId == personId).ToList());

        public Task ReassignAsync(Guid fromPersonId, Guid? toPersonId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task ReassignManyAsync(
            IReadOnlyList<Guid> fromPersonIds, Guid? toPersonId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<Guid>> ListOwnedIdsAsync(
            Guid ownerId, IReadOnlyList<Guid> faceIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Guid>>(
                Faces.Where(f => f.OwnerId == ownerId && faceIds.Contains(f.Id)).Select(f => f.Id).ToList());

        public Task<int> AssignUnassignedManyAsync(
            IReadOnlyList<Guid> faceIds, Guid personId, CancellationToken cancellationToken = default)
        {
            var assigned = 0;
            foreach (var face in Faces.Where(f => f.PersonId is null && faceIds.Contains(f.Id)))
            {
                face.PersonId = personId;
                assigned++;
            }

            return Task.FromResult(assigned);
        }

        public Task<PagedResult<Photo>> ListPhotosForPersonAsync(
            Guid ownerId, Guid personId, int page, int pageSize, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PagedResult<Photo>([], 0, page, pageSize));
    }

    private sealed class InMemoryPersonRepository : IPersonRepository
    {
        public List<Person> Persons { get; } = [];

        public Task AddAsync(Person person, CancellationToken cancellationToken = default)
        {
            Persons.Add(person);
            return Task.CompletedTask;
        }

        public Task<Person?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Persons.FirstOrDefault(p => p.Id == id && p.OwnerId == ownerId));

        public Task<IReadOnlyList<Person>> ListForOwnerAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Person>>(Persons.Where(p => p.OwnerId == ownerId).ToList());

        public Task DeleteAsync(Person person, CancellationToken cancellationToken = default)
        {
            Persons.Remove(person);
            return Task.CompletedTask;
        }

        public Task DeleteRangeAsync(IReadOnlyList<Person> persons, CancellationToken cancellationToken = default)
        {
            foreach (var person in persons)
            {
                Persons.Remove(person);
            }

            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryPhotoLabelRepository : IPhotoLabelRepository
    {
        public Dictionary<Guid, List<PhotoLabel>> ByPhoto { get; } = [];

        public Task ReplaceForPhotoAsync(Photo photo, IReadOnlyList<PhotoLabel> labels, CancellationToken cancellationToken = default)
        {
            ByPhoto[photo.Id] = [.. labels];
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<PhotoLabel>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<PhotoLabel>>(ByPhoto.GetValueOrDefault(photoId, []));

        public Task<IReadOnlyList<LabelCount>> ListTopForOwnerAsync(Guid ownerId, int limit, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LabelCount>>([]);

        public Task<PagedResult<Photo>> ListPhotosForLabelAsync(
            Guid ownerId, string label, int page, int pageSize, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PagedResult<Photo>([], 0, page, pageSize));
    }
}
