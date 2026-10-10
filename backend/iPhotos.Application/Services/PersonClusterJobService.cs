using System.Numerics.Tensors;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// Full per-owner reclustering pass (doc 18 §7.2): Chinese Whispers over every face
/// embedding, names preserved by majority vote, then exact centroid/cover/count
/// recomputation and removal of emptied persons. Idempotent — re-running with the
/// same data converges to the same clustering.
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
            await ReclusterAsync(job.OwnerId, cancellationToken);
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

    public async Task ReclusterAsync(Guid ownerId, CancellationToken cancellationToken)
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
