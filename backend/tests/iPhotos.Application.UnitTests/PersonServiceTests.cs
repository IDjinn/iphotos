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
    private readonly FakeUnitOfWork unitOfWork = new();
    private readonly InMemorySuggestionCache suggestionCache = new();
    private readonly PersonService service;

    public PersonServiceTests()
    {
        service = new PersonService(
            persons,
            faces,
            reviews,
            new ChineseWhispersClusterer(),
            unitOfWork,
            new StubDateTimeProvider(Now),
            Options.Create(new MlOptions { SuggestThreshold = 0.75f, MatchThreshold = 0.9f }),
            suggestionCache,
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

    private PhotoFace NewFace(float[] embedding, Guid? personId = null, Guid? photoId = null)
    {
        var face = PhotoFace.Create(
            photoId ?? Guid.NewGuid(), Owner, "buffalo_l", 10, 10, 100, 100, 0.9f, embedding,
            $"crop-{Guid.NewGuid():N}.jpg", Now);
        face.PersonId = personId;
        faces.Faces.Add(face);
        return face;
    }

    private Photo NewPhoto(DateTimeOffset takenAt)
    {
        var photo = Photo.Create(Owner, $"hash-{Guid.NewGuid():N}", $"p-{Guid.NewGuid():N}.jpg", "image/jpeg", 100, Now);
        photo.TakenAt = takenAt;
        faces.Photos.Add(photo);
        return photo;
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
    public async Task ListAsync_pages_the_ordered_list()
    {
        var unnamedBig = NewPerson(null);
        unnamedBig.FaceCount = 5;
        var namedSmall = NewPerson("Bea");
        namedSmall.FaceCount = 2;
        var namedBig = NewPerson("Al");
        namedBig.FaceCount = 9;
        var unnamedSmall = NewPerson(null);
        unnamedSmall.FaceCount = 1;

        var page = await service.ListAsync(Owner, new PersonFilter(), page: 2, pageSize: 3);

        Assert.Equal(4, page.TotalCount);
        Assert.Equal(2, page.Page);
        Assert.Equal(3, page.PageSize);
        Assert.Equal([unnamedSmall.Id], page.Items.Select(p => p.Id).ToList());
    }

    [Fact]
    public async Task ListAsync_filters_by_named_and_name_term()
    {
        var unnamedBig = NewPerson(null);
        unnamedBig.FaceCount = 5;
        var namedSmall = NewPerson("Bea");
        namedSmall.FaceCount = 2;
        var namedBig = NewPerson("Al");
        namedBig.FaceCount = 9;
        var unnamedSmall = NewPerson(null);
        unnamedSmall.FaceCount = 1;

        var named = await service.ListAsync(Owner, new PersonFilter(IsNamed: true), 1, 10);
        Assert.Equal(2, named.TotalCount);
        Assert.Equal([namedBig.Id, namedSmall.Id], named.Items.Select(p => p.Id).ToList());

        var unnamed = await service.ListAsync(Owner, new PersonFilter(IsNamed: false), 1, 10);
        Assert.Equal(2, unnamed.TotalCount);
        Assert.Equal([unnamedBig.Id, unnamedSmall.Id], unnamed.Items.Select(p => p.Id).ToList());

        var search = await service.ListAsync(Owner, new PersonFilter(Name: "bea"), 1, 10);
        Assert.Equal(1, search.TotalCount);
        Assert.Equal([namedSmall.Id], search.Items.Select(p => p.Id).ToList());
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
    public async Task SuggestAsync_caches_per_owner_until_the_state_stamp_moves()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), alice.Id);
        persons.Stamp = new SuggestionStamp(1, 1, 1, Now, 0);

        var first = await service.SuggestAsync(Owner);
        var second = await service.SuggestAsync(Owner);
        Assert.Same(first, second);

        // Untracked mutation (stamp unchanged): the cached queues come back.
        var extra = NewFace(UnitVector(1, 0, 0));
        var stale = await service.SuggestAsync(Owner);
        Assert.Same(first, stale);

        // Stamp catches up with the mutation: the queues recompute.
        persons.Stamp = new SuggestionStamp(2, 1, 1, Now, 0);
        var fresh = await service.SuggestAsync(Owner);
        Assert.NotSame(first, fresh);
        var merge = Assert.Single(fresh.Merges);
        Assert.Contains(extra.Id, merge.FaceIds);

        // Another owner never sees this cache entry.
        var other = await service.SuggestAsync(Guid.NewGuid());
        Assert.Empty(other.Merges);
    }

    [Fact]
    public async Task SuggestAsync_carries_every_cluster_face_in_the_card()
    {
        // 210 close faces — above the old 200-face card cap — form ONE new-person
        // suggestion whose FaceIds list is uncapped.
        for (var i = 0; i < 210; i++)
        {
            NewFace(UnitVector(1, 0, 0));
        }

        var result = await service.SuggestAsync(Owner);

        var novel = Assert.Single(result.NewPeople);
        Assert.Equal(210, novel.FaceCount);
        Assert.Equal(210, novel.FaceIds.Count);
    }

    [Fact]
    public async Task ListSuggestionPhotosAsync_pages_the_whole_cluster()
    {
        var oldest = NewPhoto(Now.AddHours(-2));
        var middle = NewPhoto(Now.AddHours(-1));
        var newest = NewPhoto(Now);
        NewFace(UnitVector(1, 0, 0), photoId: oldest.Id);
        NewFace(UnitVector(1, 0, 0), photoId: middle.Id);
        NewFace(UnitVector(1, 0, 0), photoId: newest.Id);

        var novel = Assert.Single((await service.SuggestAsync(Owner)).NewPeople);

        var first = await service.ListSuggestionPhotosAsync(Owner, novel.Id, page: 1, pageSize: 2);
        Assert.Equal(3, first.TotalCount);
        Assert.Equal([newest.Id, middle.Id], first.Items.Select(p => p.Id).ToList());

        var second = await service.ListSuggestionPhotosAsync(Owner, novel.Id, page: 2, pageSize: 2);
        Assert.Equal([oldest.Id], second.Items.Select(p => p.Id).ToList());
    }

    [Fact]
    public async Task ListSuggestionPhotosAsync_unknown_suggestion_is_not_found()
    {
        NewFace(UnitVector(1, 0, 0));
        NewFace(UnitVector(1, 0, 0));

        await Assert.ThrowsAsync<NotFoundException>(
            () => service.ListSuggestionPhotosAsync(Owner, "unknown-id", 1, 20));
    }

    [Fact]
    public async Task SuggestAsync_new_person_queue_is_not_capped()
    {
        // 25 well-separated pairs (orthogonal directions cluster apart) — above
        // the old MaxSuggestions cap of 20, every cluster must still surface.
        for (var i = 0; i < 25; i++)
        {
            var direction = new float[25];
            direction[i] = 1;
            NewFace(direction);
            NewFace(direction);
        }

        var result = await service.SuggestAsync(Owner);

        Assert.Equal(25, result.NewPeople.Count);
    }

    [Fact]
    public async Task SuggestNewPeoplePageAsync_slices_the_whole_queue()
    {
        for (var i = 0; i < 25; i++)
        {
            var direction = new float[25];
            direction[i] = 1;
            NewFace(direction);
            NewFace(direction);
        }

        var first = await service.SuggestNewPeoplePageAsync(Owner, page: 1, pageSize: 20);
        Assert.Equal(25, first.TotalCount);
        Assert.Equal(20, first.Items.Count);

        var second = await service.SuggestNewPeoplePageAsync(Owner, page: 2, pageSize: 20);
        Assert.Equal(5, second.Items.Count);
    }

    [Fact]
    public async Task AcceptSuggestionAsync_merges_the_whole_cluster_uncapped()
    {
        const int count = 250;
        var faces = new List<PhotoFace>(count);
        for (var i = 0; i < count; i++)
        {
            faces.Add(NewFace(UnitVector(1, 0, 0)));
        }

        var person = await service.AcceptSuggestionAsync(Owner, faces.Select(f => f.Id).ToList());

        Assert.Equal(count, person.FaceCount);
        Assert.All(faces, face => Assert.Equal(person.Id, face.PersonId));
    }

    [Fact]
    public async Task AcceptMergeSuggestionAsync_merges_the_whole_cluster_uncapped()
    {
        var alice = NewPerson("Alice", UnitVector(1, 0, 0));
        alice.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), alice.Id);
        var candidates = new List<PhotoFace>(210);
        for (var i = 0; i < 210; i++)
        {
            candidates.Add(NewFace(UnitVector(1, 0, 0)));
        }

        await service.AcceptMergeSuggestionAsync(Owner, alice.Id, candidates.Select(f => f.Id).ToList());

        Assert.Equal(211, alice.FaceCount);
        Assert.All(candidates, face => Assert.Equal(alice.Id, face.PersonId));
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

        // The person gains faces (better embedding) — production recomputes the
        // aggregates and touches the person, which moves the change stamp; the
        // fake needs the stamp bumped by hand. The deferral expires.
        alice.FaceCount = 4;
        persons.Stamp = new SuggestionStamp(1, 0, 1, Now.AddSeconds(1), 1);
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

    [Fact]
    public async Task MergeManyAsync_moves_faces_reviews_and_deletes_sources()
    {
        var target = NewPerson("Target", UnitVector(1, 0, 0));
        target.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), target.Id);
        var sourceA = NewPerson("A", UnitVector(0.97f, 0.24f, 0));
        sourceA.FaceCount = 1;
        NewFace(UnitVector(0.97f, 0.24f, 0), sourceA.Id);
        var sourceB = NewPerson("B", UnitVector(0.94f, 0.34f, 0));
        sourceB.FaceCount = 1;
        NewFace(UnitVector(0.94f, 0.34f, 0), sourceB.Id);
        var rejected = NewFace(UnitVector(0.9f, 0.3f, 0.1f));
        reviews.Decisions.Add(FaceReviewDecision.Create(
            Owner, rejected.Id, sourceA.Id, FaceReviewKind.Rejected, personFaceCount: 1, Now));

        await service.MergeManyAsync(Owner, target.Id, [sourceA.Id, sourceB.Id]);

        Assert.DoesNotContain(persons.Persons, p => p.Id == sourceA.Id);
        Assert.DoesNotContain(persons.Persons, p => p.Id == sourceB.Id);
        Assert.Equal(3, target.FaceCount);
        Assert.All(faces.Faces.Where(f => f.Id != rejected.Id), f => Assert.Equal(target.Id, f.PersonId));
        Assert.Null(rejected.PersonId);
        Assert.Equal(target.Id, reviews.Decisions.Single(d => d.FaceId == rejected.Id).PersonId);
        Assert.Equal(1, unitOfWork.TransactionsBegun);
        Assert.Equal(1, unitOfWork.TransactionsCommitted);
    }

    [Fact]
    public async Task MergeAsync_moves_faces_and_deletes_the_source()
    {
        var target = NewPerson("Target", UnitVector(1, 0, 0));
        target.FaceCount = 1;
        NewFace(UnitVector(1, 0, 0), target.Id);
        var source = NewPerson("A", UnitVector(0.97f, 0.24f, 0));
        source.FaceCount = 1;
        NewFace(UnitVector(0.97f, 0.24f, 0), source.Id);

        await service.MergeAsync(Owner, source.Id, target.Id);

        Assert.DoesNotContain(persons.Persons, p => p.Id == source.Id);
        Assert.Equal(2, target.FaceCount);
        Assert.All(faces.Faces, f => Assert.Equal(target.Id, f.PersonId));
    }

    [Fact]
    public async Task MergeManyAsync_rejects_merging_a_person_into_itself()
    {
        var target = NewPerson("Target", UnitVector(1, 0, 0));

        await Assert.ThrowsAsync<ValidationException>(
            () => service.MergeManyAsync(Owner, target.Id, [target.Id]));
    }

    [Fact]
    public async Task MergeManyAsync_rejects_an_empty_source_list()
    {
        var target = NewPerson("Target", UnitVector(1, 0, 0));

        await Assert.ThrowsAsync<ValidationException>(
            () => service.MergeManyAsync(Owner, target.Id, []));
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

        public Task ReassignManyAsync(
            IReadOnlyList<Guid> fromPersonIds, Guid? toPersonId, CancellationToken cancellationToken = default)
        {
            foreach (var face in Faces.Where(f => f.PersonId is { } id && fromPersonIds.Contains(id)))
            {
                face.PersonId = toPersonId;
            }

            return Task.CompletedTask;
        }

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

        public List<Photo> Photos { get; } = [];

        public Task<PagedResult<Photo>> ListPhotosForFacesAsync(
            Guid ownerId, IReadOnlyList<Guid> faceIds, int page, int pageSize, CancellationToken cancellationToken = default)
        {
            var photoIds = Faces
                .Where(f => f.OwnerId == ownerId && faceIds.Contains(f.Id))
                .Select(f => f.PhotoId)
                .ToHashSet();
            var owned = Photos
                .Where(p => p.OwnerId == ownerId && photoIds.Contains(p.Id))
                .OrderByDescending(p => p.TakenAt ?? p.CreatedAt)
                .ToList();

            return Task.FromResult(new PagedResult<Photo>(
                owned.Skip((page - 1) * pageSize).Take(pageSize).ToList(), page, pageSize, owned.Count));
        }
    }
}
