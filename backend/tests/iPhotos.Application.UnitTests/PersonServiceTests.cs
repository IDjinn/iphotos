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

/// <summary>PersonService behaviors around the per-person review (doc 18 §7.4/§10):
/// named-first listing, the person confidence metric, the suggestion queue split
/// into per-person merges vs new-person clusters, and the merge accept path.</summary>
public sealed class PersonServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-10T12:00:00Z");
    private static readonly Guid Owner = Guid.NewGuid();

    private readonly InMemoryPersonRepository persons = new();
    private readonly InMemoryFaceRepository faces = new();
    private readonly InMemoryFaceReviewRepository reviews = new();
    private readonly PersonService service;

    public PersonServiceTests()
    {
        service = new PersonService(
            persons,
            faces,
            reviews,
            new ChineseWhispersClusterer(),
            new FakeUnitOfWork(),
            new StubDateTimeProvider(Now),
            Options.Create(new MlOptions { SuggestThreshold = 0.75f, MatchThreshold = 0.9f }),
            NullLogger<PersonService>.Instance);
    }

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
    public async Task ListAsync_lists_named_people_before_unnamed_groups()
    {
        var unnamedBig = NewPerson(null);
        unnamedBig.FaceCount = 5;
        var namedSmall = NewPerson("Bea");
        namedSmall.FaceCount = 2;
        var namedBig = NewPerson("Al");
        namedBig.FaceCount = 9;
        var unnamedSmall = NewPerson(null);
        unnamedSmall.FaceCount = 1;

        var result = await service.ListAsync(Owner);

        Assert.Equal(
            [namedBig.Id, namedSmall.Id, unnamedBig.Id, unnamedSmall.Id],
            result.Select(p => p.Id).ToList());
    }

    [Fact]
    public async Task GetAsync_confidence_is_mean_member_similarity_to_centroid()
    {
        var person = NewPerson("Alice", UnitVector(1, 0, 0));
        person.FaceCount = 2;
        NewFace(UnitVector(1, 0, 0), person.Id);
        NewFace(UnitVector(0.6f, 0.8f, 0), person.Id);

        var detail = await service.GetAsync(Owner, person.Id);

        Assert.Equal(0.8f, detail.Confidence!.Value, precision: 3);
    }

    [Fact]
    public async Task GetAsync_confidence_is_null_without_centroid()
    {
        var person = NewPerson(null);
        person.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), person.Id);

        var detail = await service.GetAsync(Owner, person.Id);

        Assert.Null(detail.Confidence);
    }

    [Fact]
    public async Task SuggestAsync_routes_close_faces_to_persons_and_rest_to_new_clusters()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 3;
        var mergeFace = NewFace(UnitVector(0.97f, 0.24f, 0));
        var newA = NewFace(UnitVector(0.05f, 0.99f, 0.1f));
        var newB = NewFace(UnitVector(0.04f, 0.99f, 0.12f));

        var result = await service.SuggestAsync(Owner);

        var merge = Assert.Single(result.Merges);
        Assert.Equal(alice.Id, merge.PersonId);
        Assert.Equal("Alice", merge.PersonName);
        Assert.Contains(mergeFace.Id, merge.FaceIds);
        Assert.True(merge.Similarity >= 0.75f);

        var novel = Assert.Single(result.NewPeople);
        Assert.Equal(2, novel.FaceCount);
        Assert.Contains(newA.Id, novel.FaceIds);
        Assert.Contains(newB.Id, novel.FaceIds);
    }

    [Fact]
    public async Task SuggestAsync_without_people_suggests_only_new_persons()
    {
        NewFace(UnitVector(1, 0, 0));
        NewFace(UnitVector(0.98f, 0.1f, 0.05f));

        var result = await service.SuggestAsync(Owner);

        Assert.Empty(result.Merges);
        var novel = Assert.Single(result.NewPeople);
        Assert.Equal(2, novel.FaceCount);
    }

    [Fact]
    public async Task AcceptMergeSuggestionAsync_assigns_faces_and_recomputes_aggregates()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), alice.Id);
        var candidate = NewFace(UnitVector(0.97f, 0.24f, 0));

        await service.AcceptMergeSuggestionAsync(Owner, alice.Id, [candidate.Id]);

        Assert.Equal(alice.Id, candidate.PersonId);
        Assert.Equal(2, alice.FaceCount);
        Assert.True(
            TensorPrimitives.CosineSimilarity(alice.Centroid!, UnitVector(1, 0, 0)) > 0.99f,
            "centroid should stay dominated by the near-identical members");
    }

    [Fact]
    public async Task AcceptMergeSuggestionAsync_skips_already_assigned_faces()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 1;
        var member = NewFace(UnitVector(1, 0, 0), alice.Id);

        await service.AcceptMergeSuggestionAsync(Owner, alice.Id, [member.Id]);

        Assert.Equal(1, alice.FaceCount);
    }

    [Fact]
    public async Task AcceptMergeSuggestionAsync_rejects_faces_of_other_owners()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        var foreign = PhotoFace.Create(
            Guid.NewGuid(), Guid.NewGuid(), "buffalo_l", 1, 1, 10, 10, 0.9f,
            UnitVector(1, 0, 0), "crop.jpg", Now);
        faces.Faces.Add(foreign);

        await Assert.ThrowsAsync<NotFoundException>(
            () => service.AcceptMergeSuggestionAsync(Owner, alice.Id, [foreign.Id]));
    }

    [Fact]
    public async Task SuggestAsync_chains_transitive_duplicates_into_a_single_group()
    {
        // A·B and B·C clear the threshold while A·C does not — one fragmented
        // person whose clusters only connect through the middle one.
        var big = NewPerson(null, UnitVector(1, 0, 0));
        big.FaceCount = 48;
        var mid = NewPerson(null, UnitVector(0.8f, 0.6f, 0));
        mid.FaceCount = 13;
        var far = NewPerson(null, UnitVector(0.25f, 0.968f, 0));
        far.FaceCount = 4;

        var result = await service.SuggestAsync(Owner);

        var group = Assert.Single(result.PersonMergeGroups);
        Assert.Equal(big.Id, group.Target.PersonId);
        Assert.Equal([mid.Id, far.Id], group.Members.Select(m => m.PersonId).ToList());
        Assert.True(group.MinSimilarity >= 0.75f);
        Assert.Empty(result.Merges);
        Assert.Empty(result.NewPeople);
    }

    [Fact]
    public async Task SuggestAsync_orders_person_merge_groups_by_total_faces()
    {
        var bigA = NewPerson(null, UnitVector(1, 0, 0));
        bigA.FaceCount = 90;
        var bigB = NewPerson(null, UnitVector(0.97f, 0.24f, 0));
        bigB.FaceCount = 30;
        var smallA = NewPerson(null, UnitVector(0, 1, 0));
        smallA.FaceCount = 15;
        var smallB = NewPerson(null, UnitVector(0.24f, 0.97f, 0));
        smallB.FaceCount = 5;

        var result = await service.SuggestAsync(Owner);

        Assert.Equal(2, result.PersonMergeGroups.Count);
        Assert.Equal(bigA.Id, result.PersonMergeGroups[0].Target.PersonId);
        Assert.Equal(smallA.Id, result.PersonMergeGroups[1].Target.PersonId);
    }

    [Fact]
    public async Task SuggestAsync_person_merge_targets_the_named_side()
    {
        var named = NewPerson("Lucas", UnitVector(1, 0, 0));
        named.FaceCount = 3;
        var unnamed = NewPerson(null, UnitVector(0.97f, 0.24f, 0));
        unnamed.FaceCount = 9;

        var result = await service.SuggestAsync(Owner);

        var group = Assert.Single(result.PersonMergeGroups);
        Assert.Equal(named.Id, group.Target.PersonId);
        var member = Assert.Single(group.Members);
        Assert.Equal(unnamed.Id, member.PersonId);
    }

    [Fact]
    public async Task SuggestAsync_never_suggests_merging_two_named_people()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 3;
        var bea = NewPerson("Bea", UnitVector(0.97f, 0.24f, 0));
        bea.FaceCount = 3;

        var result = await service.SuggestAsync(Owner);

        Assert.Empty(result.PersonMergeGroups);
    }

    [Fact]
    public async Task SuggestAsync_suggests_person_merges_without_unassigned_faces()
    {
        var big = NewPerson(null, UnitVector(1, 0, 0));
        big.FaceCount = 10;
        var small = NewPerson(null, UnitVector(0.97f, 0.24f, 0));
        small.FaceCount = 4;

        var result = await service.SuggestAsync(Owner);

        var group = Assert.Single(result.PersonMergeGroups);
        Assert.Equal(big.Id, group.Target.PersonId);
    }

    [Fact]
    public async Task ReviewSuggestionAsync_records_decisions_and_assigns_accepted_faces()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), alice.Id);
        var accepted = NewFace(UnitVector(0.97f, 0.24f, 0));
        var rejected = NewFace(UnitVector(0.9f, 0.3f, 0.1f));
        var unsure = NewFace(UnitVector(0.85f, 0.4f, 0.2f));

        await service.ReviewSuggestionAsync(Owner, alice.Id, [accepted.Id], [rejected.Id], [unsure.Id]);

        Assert.Equal(alice.Id, accepted.PersonId);
        Assert.Null(rejected.PersonId);
        Assert.Equal(2, alice.FaceCount);
        var rejectedDecision = reviews.Decisions.Single(d => d.FaceId == rejected.Id);
        Assert.Equal(FaceReviewKind.Rejected, rejectedDecision.Decision);
        Assert.Equal(2, rejectedDecision.PersonFaceCount);
        var deferredDecision = reviews.Decisions.Single(d => d.FaceId == unsure.Id);
        Assert.Equal(FaceReviewKind.Deferred, deferredDecision.Decision);
    }

    [Fact]
    public async Task SuggestAsync_skips_rejected_faces_for_that_person()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 3;
        var face = NewFace(UnitVector(0.97f, 0.24f, 0));
        await service.ReviewSuggestionAsync(Owner, alice.Id, [], [face.Id], []);

        var result = await service.SuggestAsync(Owner);

        Assert.Empty(result.Merges);
    }

    [Fact]
    public async Task SuggestAsync_reoffers_deferred_faces_once_the_person_grows()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 3;
        var face = NewFace(UnitVector(0.97f, 0.24f, 0));
        await service.ReviewSuggestionAsync(Owner, alice.Id, [], [], [face.Id]);

        // Same size — still deferred.
        var held = await service.SuggestAsync(Owner);
        Assert.Empty(held.Merges);

        // The person gains faces (better embedding) — the deferral expires.
        alice.FaceCount = 4;
        var retried = await service.SuggestAsync(Owner);
        var merge = Assert.Single(retried.Merges);
        Assert.Contains(face.Id, merge.FaceIds);
    }

    [Fact]
    public async Task SuggestAsync_rejection_only_blocks_the_rejected_person()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 3;
        var bob = NewPerson("Bob", UnitVector(0.8f, 0.5f, 0.2f));
        bob.FaceCount = 3;
        var face = NewFace(UnitVector(0.97f, 0.24f, 0));
        await service.ReviewSuggestionAsync(Owner, alice.Id, [], [face.Id], []);

        var result = await service.SuggestAsync(Owner);

        // Alice scored higher (0.97) but is rejected; Bob (0.93) still clears
        // the threshold, so the face routes there.
        var merge = Assert.Single(result.Merges);
        Assert.Equal(bob.Id, merge.PersonId);
    }

    private sealed class InMemoryFaceReviewRepository : IFaceReviewRepository
    {
        public List<FaceReviewDecision> Decisions { get; } = [];

        public Task<IReadOnlyList<FaceReviewDecision>> ListForOwnerAsync(
            Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<FaceReviewDecision>>(
                Decisions.Where(d => d.OwnerId == ownerId).ToList());

        public Task AddRangeAsync(
            IReadOnlyList<FaceReviewDecision> decisions, CancellationToken cancellationToken = default)
        {
            Decisions.AddRange(decisions);
            return Task.CompletedTask;
        }

        public Task ReassignPersonAsync(
            Guid fromPersonId, Guid toPersonId, CancellationToken cancellationToken = default)
        {
            foreach (var decision in Decisions.Where(d => d.PersonId == fromPersonId))
            {
                decision.PersonId = toPersonId;
            }

            return Task.CompletedTask;
        }

        public Task DeleteForPersonAsync(Guid personId, CancellationToken cancellationToken = default)
        {
            Decisions.RemoveAll(d => d.PersonId == personId);
            return Task.CompletedTask;
        }
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

        public Task ReassignAsync(Guid fromPersonId, Guid? toPersonId, CancellationToken cancellationToken = default)
        {
            foreach (var face in Faces.Where(f => f.PersonId == fromPersonId))
            {
                face.PersonId = toPersonId;
            }

            return Task.CompletedTask;
        }

        public Task<PagedResult<Photo>> ListPhotosForPersonAsync(
            Guid ownerId, Guid personId, int page, int pageSize, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PagedResult<Photo>([], 0, page, pageSize));
    }
}
