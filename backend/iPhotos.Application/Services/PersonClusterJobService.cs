using System.Numerics.Tensors;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Per-owner clustering pass (doc 18 §7.2), two modes:
/// <see cref="ReclusterIncrementalAsync"/> (default) only touches faces without a
/// person — close centroids join their person (MatchThreshold), the rest cluster
/// via Chinese Whispers into NEW people — so user structure (merges, review
/// verdicts, move-face) is never undone. <see cref="ReclusterAsync"/> is the full
/// pass that reassigns every face (majority-vote name preservation, emptied
/// persons removed) — a repair tool for threshold changes, opted in via
/// <c>Ml:FullRecluster</c>.
/// </summary>
public sealed class PersonClusterJobService(
    IFaceRepository faces,
    IPersonRepository persons,
    IFaceClusterer clusterer,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<MlOptions> options,
    ILogger<PersonClusterJobService> logger) : IMlJobHandler
{
    public async Task ProcessJobAsync(MlJob job, CancellationToken cancellationToken = default)
    {
        try
        {
            if (options.Value.FullRecluster)
            {
                await ReclusterAsync(job.OwnerId, cancellationToken);
            }
            else
            {
                await ReclusterIncrementalAsync(job.OwnerId, cancellationToken);
            }

            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Cluster job {JobId} finished for owner {OwnerId}", job.Id, job.OwnerId);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            logger.LogWarning(ex, "Cluster job {JobId} failed, {Outcome} (attempt {Attempt}/{Max})",
                job.Id, willRetry ? "requeued" : "permanently failed", job.Attempts, job.MaxAttempts);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Incremental pass: assigned faces are the user's structure and are never
    /// moved or deleted. Unassigned faces first join the closest centroid above
    /// MatchThreshold (same signal as the faces job), then the leftovers cluster
    /// among themselves into new people (Chinese Whispers, MinClusterFaces —
    /// smaller groups stay unassigned).
    /// </summary>
    public async Task ReclusterIncrementalAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var allFaces = await faces.ListForOwnerAsync(ownerId, cancellationToken);
        var unassigned = allFaces.Where(f => f.PersonId is null).ToList();
        if (unassigned.Count == 0)
        {
            return;
        }

        var allPersons = await persons.ListForOwnerAsync(ownerId, cancellationToken);
        var candidates = allPersons.Where(p => p.FaceCount > 0 && p.Centroid is not null).ToList();
        var joinedPersons = new HashSet<Guid>();

        // 1) Close-centroid join — catches faces that predate their person or
        // missed the faces job's pass.
        var remaining = new List<PhotoFace>();
        foreach (var face in unassigned)
        {
            Person? best = null;
            var bestSimilarity = options.Value.MatchThreshold;
            foreach (var person in candidates)
            {
                var similarity = TensorPrimitives.CosineSimilarity(face.Embedding, person.Centroid!);
                if (similarity >= bestSimilarity)
                {
                    best = person;
                    bestSimilarity = similarity;
                }
            }

            if (best is null)
            {
                remaining.Add(face);
            }
            else
            {
                face.PersonId = best.Id;
                joinedPersons.Add(best.Id);
            }
        }

        // 2) Leftovers cluster among themselves into NEW people only.
        var clusterMembers = new Dictionary<int, List<PhotoFace>>();
        if (remaining.Count > 0)
        {
            var assignments = clusterer.Cluster(
                remaining.Select(f => f.Embedding).ToList(), options.Value.ClusterThreshold);
            for (var i = 0; i < remaining.Count; i++)
            {
                if (!clusterMembers.TryGetValue(assignments[i], out var members))
                {
                    members = [];
                    clusterMembers[assignments[i]] = members;
                }

                members.Add(remaining[i]);
            }
        }

        // New persons must exist in the DATABASE before any face referencing them
        // is saved: EF flushes every tracked change on SaveChanges (same FK order
        // as the full pass — seen live on the first real run). Assignments to
        // EXISTING persons above are FK-safe to flush early.
        var newPersonByCluster = new Dictionary<int, Person>();
        foreach (var (cluster, members) in clusterMembers)
        {
            if (members.Count < options.Value.MinClusterFaces)
            {
                continue;
            }

            newPersonByCluster[cluster] = Person.Create(ownerId, dateTime.UtcNow);
        }

        foreach (var person in newPersonByCluster.Values)
        {
            await persons.AddAsync(person, cancellationToken);
        }

        foreach (var (cluster, members) in clusterMembers)
        {
            if (!newPersonByCluster.TryGetValue(cluster, out var person))
            {
                continue;
            }

            foreach (var face in members)
            {
                face.PersonId = person.Id;
            }
        }

        // 3) Exact aggregates for every person that gained faces this pass.
        foreach (var person in newPersonByCluster.Values)
        {
            ApplyAggregates(person, allFaces.Where(f => f.PersonId == person.Id).ToList());
        }

        foreach (var person in allPersons.Where(p => joinedPersons.Contains(p.Id)))
        {
            ApplyAggregates(person, allFaces.Where(f => f.PersonId == person.Id).ToList());
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Applies exact per-person aggregates from the in-memory face set.</summary>
    private void ApplyAggregates(Person person, IReadOnlyList<PhotoFace> members)
    {
        person.FaceCount = members.Count;
        person.Centroid = clusterer.Centroid(members.Select(f => f.Embedding).ToList());
        person.CoverFaceId = members.Count == 0
            ? null
            : members.MaxBy(f => f.CoverScore)!.Id;
        person.Touch(dateTime.UtcNow);
    }

    /// <summary>
    /// FULL reclustering pass (doc 18 §7.2): Chinese Whispers over every face
    /// embedding, names preserved by majority vote, then exact centroid/cover/count
    /// recomputation and removal of emptied persons. Idempotent, but it may move
    /// faces the user assigned manually — only run via <c>Ml:FullRecluster</c>
    /// (threshold changes, repair).
    /// </summary>
    public async Task ReclusterAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var allFaces = await faces.ListForOwnerAsync(ownerId, cancellationToken);
        var allPersons = await persons.ListForOwnerAsync(ownerId, cancellationToken);
        var threshold = options.Value.ClusterThreshold;
        var minClusterFaces = options.Value.MinClusterFaces;

        // Chinese Whispers over the owner's embeddings; faces are the graph nodes.
        var assignments = clusterer.Cluster(
            allFaces.Select(f => f.Embedding).ToList(), threshold);

        var clusterMembers = new Dictionary<int, List<PhotoFace>>();
        for (var i = 0; i < allFaces.Count; i++)
        {
            if (!clusterMembers.TryGetValue(assignments[i], out var members))
            {
                members = [];
                clusterMembers[assignments[i]] = members;
            }

            members.Add(allFaces[i]);
        }

        // Preserve names: a cluster keeps the person most of its faces already belong to.
        var personById = allPersons.ToDictionary(p => p.Id);
        var clusterToPerson = new Dictionary<int, Person>();
        var personsToCreate = new List<Person>();
        foreach (var (cluster, members) in clusterMembers)
        {
            if (members.Count < minClusterFaces)
            {
                // Too small to be a person yet — faces stay unassigned until they gain neighbors.
                continue;
            }

            var existing = members
                .Where(f => f.PersonId is not null && personById.ContainsKey(f.PersonId.Value))
                .GroupBy(f => f.PersonId!.Value)
                .OrderByDescending(group => group.Count())
                .FirstOrDefault();

            if (existing is not null && personById.TryGetValue(existing.Key, out var person))
            {
                clusterToPerson[cluster] = person;
            }
            else
            {
                person = Person.Create(ownerId, dateTime.UtcNow);
                personById[person.Id] = person;
                personsToCreate.Add(person);
                clusterToPerson[cluster] = person;
            }
        }

        // New persons must exist in the DATABASE before any face referencing them
        // is saved: EF flushes every tracked change on SaveChanges, so the person
        // inserts go first — BEFORE the assignment loop below marks faces modified
        // (a combined save violates the FK; seen live on the first real run).
        foreach (var person in personsToCreate)
        {
            await persons.AddAsync(person, cancellationToken);
        }

        if (personsToCreate.Count > 0)
        {
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        // Apply assignments.
        foreach (var (cluster, members) in clusterMembers)
        {
            clusterToPerson.TryGetValue(cluster, out var person);
            var personId = person?.Id;
            foreach (var face in members)
            {
                if (face.PersonId != personId)
                {
                    face.PersonId = personId;
                }
            }
        }

        // Recompute exact aggregates per person; emptied persons are removed.
        var survivors = clusterToPerson.Values.Distinct().ToHashSet();
        foreach (var person in allPersons.Where(p => !survivors.Contains(p)).ToList())
        {
            await persons.DeleteAsync(person, cancellationToken);
        }

        foreach (var person in survivors)
        {
            var members = allFaces.Where(f => f.PersonId == person.Id).ToList();
            person.FaceCount = members.Count;
            person.Centroid = clusterer.Centroid(members.Select(f => f.Embedding).ToList());
            person.CoverFaceId = members.Count == 0
                ? null
                : members.MaxBy(f => f.CoverScore)!.Id;
            person.Touch(dateTime.UtcNow);
        }
    }
}
