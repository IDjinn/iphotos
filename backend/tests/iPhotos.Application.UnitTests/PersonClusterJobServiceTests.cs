using System.Numerics.Tensors;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace iPhotos.Application.UnitTests;

/// <summary>PersonClusterJobService modes (doc 18 §7.2): the default incremental
/// pass only assigns still-unassigned faces — user structure (merges, review
/// verdicts, move-face) is never moved — while the Ml:FullRecluster pass
/// reassigns every face as a repair tool.</summary>
public sealed class PersonClusterJobServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-10T12:00:00Z");
    private static readonly Guid Owner = Guid.NewGuid();

    private readonly InMemoryPersonRepository persons = new();
    private readonly InMemoryFaceRepository faces = new();

    private PersonClusterJobService CreateService(MlOptions? mlOptions = null) =>
        new(
            faces,
            persons,
            new ChineseWhispersClusterer(),
            new FakeUnitOfWork(),
            new StubDateTimeProvider(Now),
            Options.Create(mlOptions ?? new MlOptions
            {
                MatchThreshold = 0.9f,
                ClusterThreshold = 0.55f,
                MinClusterFaces = 2,
            }),
            NullLogger<PersonClusterJobService>.Instance);

    private Person NewPerson(string? name, float[]? centroid = null)
    {
        var person = Person.Create(Owner, Now);
        person.Name = name;
        person.Centroid = centroid;
        persons.Persons.Add(person);
        return person;
    }

    private PhotoFace NewFace(float[] embedding, Guid? personId = null)
    {
        var face = PhotoFace.Create(
            Guid.NewGuid(), Owner, "buffalo_l", 10, 10, 100, 100, 0.9f, embedding,
            $"crop-{Guid.NewGuid():N}.jpg", Now);
        face.PersonId = personId;
        faces.Faces.Add(face);
        return face;
    }

    private static float[] UnitVector(params float[] vector)
    {
        var norm = TensorPrimitives.Norm(vector);
        TensorPrimitives.Divide(vector, norm, vector);
        return vector;
    }

    [Fact]
    public async Task Incremental_joins_close_centroid_and_keeps_everything_else()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var close = NewFace(UnitVector(1, 0, 0));
        var loose = NewFace(UnitVector(0, 1, 0));

        await CreateService().ReclusterIncrementalAsync(Owner);

        Assert.Equal(al.Id, close.PersonId);
        Assert.Null(loose.PersonId);
        Assert.Equal(2, al.FaceCount);
        Assert.Single(persons.Persons);
    }

    [Fact]
    public async Task Incremental_never_moves_assigned_faces_even_when_far_from_their_person()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var outlier = NewFace(UnitVector(0, 1, 0), al.Id);

        await CreateService().ReclusterIncrementalAsync(Owner);

        Assert.Equal(al.Id, outlier.PersonId);
        Assert.Single(persons.Persons);
    }

    [Fact]
    public async Task Incremental_groups_loose_faces_into_a_new_person()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var first = NewFace(UnitVector(0, 1, 0));
        var second = NewFace(UnitVector(0.24f, 0.97f, 0));

        await CreateService().ReclusterIncrementalAsync(Owner);

        Assert.Equal(2, persons.Persons.Count);
        var created = persons.Persons.Single(p => p.Id != al.Id);
        Assert.Equal(created.Id, first.PersonId);
        Assert.Equal(created.Id, second.PersonId);
        Assert.Equal(2, created.FaceCount);
    }

    [Fact]
    public async Task Incremental_leaves_a_single_loose_face_unassigned()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var loose = NewFace(UnitVector(0, 1, 0));

        await CreateService().ReclusterIncrementalAsync(Owner);

        Assert.Null(loose.PersonId);
        Assert.Single(persons.Persons);
    }

    [Fact]
    public async Task ProcessJob_incremental_mode_does_not_reassign_assigned_faces()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 2;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var drifted = NewFace(UnitVector(0, 1, 0), al.Id);
        var bea = NewPerson("Bea", UnitVector(0, 1, 0));
        bea.FaceCount = 2;
        NewFace(UnitVector(0, 1, 0), bea.Id);
        NewFace(UnitVector(0, 1, 0), bea.Id);
        var job = MlJob.Create(Owner, null, MlJobKind.Cluster, Now);
        job.Start();

        await CreateService().ProcessJobAsync(job);

        Assert.Equal(al.Id, drifted.PersonId);
    }

    [Fact]
    public async Task ProcessJob_full_recluster_mode_reassigns_every_face()
    {
        var al = NewPerson("Al", UnitVector(1, 0, 0));
        al.FaceCount = 2;
        NewFace(UnitVector(1, 0, 0), al.Id);
        var drifted = NewFace(UnitVector(0, 1, 0), al.Id);
        var bea = NewPerson("Bea", UnitVector(0, 1, 0));
        bea.FaceCount = 2;
        NewFace(UnitVector(0, 1, 0), bea.Id);
        NewFace(UnitVector(0, 1, 0), bea.Id);
        var job = MlJob.Create(Owner, null, MlJobKind.Cluster, Now);
        job.Start();

        await CreateService(new MlOptions
        {
            MatchThreshold = 0.9f,
            ClusterThreshold = 0.55f,
            MinClusterFaces = 2,
            FullRecluster = true,
        }).ProcessJobAsync(job);

        // The (0,1,0) cluster holds 3 faces — 2 of them Bea's — so the majority
        // vote moves the drifted face to Bea. Al's surviving face is a singleton
        // (below MinClusterFaces), so the full pass drops it AND deletes Al —
        // exactly why this mode is opt-in.
        Assert.Equal(bea.Id, drifted.PersonId);
        Assert.DoesNotContain(persons.Persons, p => p.Id == al.Id);
        Assert.Equal(3, bea.FaceCount);
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

    private sealed class InMemoryFaceRepository : IFaceRepository
    {
        public List<PhotoFace> Faces { get; } = [];

        public Task AddRangeAsync(IReadOnlyList<PhotoFace> list, CancellationToken cancellationToken = default)
        {
            Faces.AddRange(list);
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
            Task.FromResult<IReadOnlyList<PhotoFace>>(
                Faces.Where(f => f.OwnerId == ownerId && f.PersonId == personId).ToList());

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
}
