using System.Numerics.Tensors;
using System.Security.Cryptography;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>
/// API-facing person operations (doc 18 §7.3): listing, renaming, merging, moving
/// faces between people and deleting. All aggregates (count/centroid/cover) are
/// recomputed exactly on every mutation so the incremental path's drift is corrected.
/// </summary>
public sealed class PersonService(
    IPersonRepository persons,
    IFaceRepository faces,
    IFaceClusterer clusterer,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<MlOptions> options,
    ILogger<PersonService> logger)
{
    public async Task<IReadOnlyList<PersonDto>> ListAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var people = await persons.ListForOwnerAsync(ownerId, cancellationToken);
        return people
            // Named people first, unnamed auto-groups after — the grids the
            // clients render from this never interleave the two (doc 18 §10).
            .OrderByDescending(p => p.Name is not null)
            .ThenByDescending(p => p.FaceCount)
            .Select(p => new PersonDto(p.Id, p.Name, p.FaceCount, p.CoverFaceId))
            .ToList();
    }

    public async Task<PersonDetailDto> GetAsync(Guid ownerId, Guid personId, CancellationToken cancellationToken = default)
    {
        var person = await GetPersonOrThrowAsync(ownerId, personId, cancellationToken);
        return new PersonDetailDto(
            person.Id, person.Name, person.FaceCount, person.CoverFaceId,
            await ConfidenceAsync(ownerId, person, cancellationToken));
    }

    public async Task<PagedResult<PhotoDto>> ListPhotosAsync(
        Guid ownerId, Guid personId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        await GetPersonOrThrowAsync(ownerId, personId, cancellationToken);
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var result = await faces.ListPhotosForPersonAsync(ownerId, personId, page, pageSize, cancellationToken);
        return new PagedResult<PhotoDto>(
            result.Items.Select(p => PhotoDto.From(p, [])).ToList(),
            result.Page, result.PageSize, result.TotalCount);
    }

    public async Task RenameAsync(Guid ownerId, Guid personId, string? name, CancellationToken cancellationToken = default)
    {
        var person = await GetPersonOrThrowAsync(ownerId, personId, cancellationToken);
        if (name is not null && name.Trim().Length > Person.MaxNameLength)
        {
            throw new ValidationException($"Person names are limited to {Person.MaxNameLength} characters.", ErrorCodes.Validation);
        }

        person.Rename(name, dateTime.UtcNow);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task MergeAsync(Guid ownerId, Guid sourceId, Guid targetId, CancellationToken cancellationToken = default)
    {
        if (sourceId == targetId)
        {
            throw new ValidationException("Cannot merge a person into itself.", ErrorCodes.Validation);
        }

        var source = await GetPersonOrThrowAsync(ownerId, sourceId, cancellationToken);
        var target = await GetPersonOrThrowAsync(ownerId, targetId, cancellationToken);

        await faces.ReassignAsync(source.Id, target.Id, cancellationToken);
        await persons.DeleteAsync(source, cancellationToken);
        await RecomputeAsync(ownerId, target, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Person {Source} merged into {Target} (owner {Owner})", sourceId, targetId, ownerId);
    }

    /// <summary>Moves one face to another person, or starts a new person when <paramref
    /// name="targetPersonId"/> is null — the correction/split mechanism (doc 18 §7.3).</summary>
    public async Task MoveFaceAsync(Guid ownerId, Guid faceId, Guid? targetPersonId, CancellationToken cancellationToken = default)
    {
        var face = await faces.GetByIdAsync(faceId, cancellationToken);
        if (face is null || face.OwnerId != ownerId)
        {
            throw new NotFoundException($"Face '{faceId}' was not found.", ErrorCodes.FacesNotFound);
        }

        Person? source = face.PersonId is { } sourceId
            ? await persons.GetByIdForOwnerAsync(sourceId, ownerId, cancellationToken)
            : null;

        Person? target;
        if (targetPersonId is null)
        {
            target = Person.Create(ownerId, dateTime.UtcNow);
            await persons.AddAsync(target, cancellationToken);
        }
        else
        {
            target = await persons.GetByIdForOwnerAsync(targetPersonId.Value, ownerId, cancellationToken)
                ?? throw new NotFoundException($"Person '{targetPersonId}' was not found.", ErrorCodes.PeopleNotFound);
        }

        if (source?.Id == target.Id)
        {
            throw new ValidationException("The face already belongs to this person.", ErrorCodes.Validation);
        }

        face.PersonId = target.Id;
        await RecomputeAsync(ownerId, target, cancellationToken);
        if (source is not null)
        {
            await RecomputeAsync(ownerId, source, cancellationToken);
            if (source.FaceCount == 0)
            {
                await persons.DeleteAsync(source, cancellationToken);
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(Guid ownerId, Guid personId, CancellationToken cancellationToken = default)
    {
        var person = await GetPersonOrThrowAsync(ownerId, personId, cancellationToken);
        await faces.ReassignAsync(person.Id, null, cancellationToken);
        await persons.DeleteAsync(person, cancellationToken);
    }

    /// <summary>Suggestion list caps — review UI scale, not a data limit.</summary>
    public const int MaxSuggestions = 20;
    public const int SamplePhotoLimit = 8;
    public const int MaxSuggestionFaces = 200;

    /// <summary>
    /// The "same person?" review queue (doc 18 §7.4), split by destination like
    /// Google Photos: unassigned faces whose best centroid similarity reaches
    /// SuggestThreshold become per-person <see cref="MergeSuggestionDto"/> groups
    /// ("is this the same person as X?"); the leftovers cluster via Chinese
    /// Whispers into <see cref="PersonSuggestionDto"/> candidates for a new
    /// person. Purely derived (nothing persisted), so a dismissed group can
    /// reappear until its faces are assigned or its members change — clients
    /// keep the dismissal list keyed by the stable suggestion id.
    /// </summary>
    public async Task<PersonSuggestionsDto> SuggestAsync(
        Guid ownerId, CancellationToken cancellationToken = default)
    {
        var people = await persons.ListForOwnerAsync(ownerId, cancellationToken);
        var unassigned = (await faces.ListForOwnerAsync(ownerId, cancellationToken))
            .Where(f => f.PersonId is null)
            .ToList();
        if (unassigned.Count == 0)
        {
            return new PersonSuggestionsDto([], []);
        }

        // Never suggest above the auto-match threshold — those faces belong to a
        // person on the next clustering pass anyway.
        var threshold = Math.Min(options.Value.SuggestThreshold, options.Value.MatchThreshold);

        // 1) Merge candidates: each unassigned face joins the existing person it
        //    is closest to, when that similarity clears the threshold. A face
        //    enters at most one group (its best match), so the two queues below
        //    never share members.
        var withCentroid = people.Where(p => p.Centroid is not null).ToList();
        var mergeGroups = new Dictionary<Guid, (Person Person, List<(PhotoFace Face, float Score)> Members)>();
        var claimed = new HashSet<Guid>();
        if (withCentroid.Count > 0)
        {
            foreach (var face in unassigned)
            {
                Person? best = null;
                var bestScore = threshold;
                foreach (var person in withCentroid)
                {
                    var score = TensorPrimitives.CosineSimilarity(face.Embedding, person.Centroid!);
                    if (score >= bestScore)
                    {
                        bestScore = score;
                        best = person;
                    }
                }

                if (best is null)
                {
                    continue;
                }

                claimed.Add(face.Id);
                if (!mergeGroups.TryGetValue(best.Id, out var group))
                {
                    mergeGroups[best.Id] = group = (best, []);
                }

                group.Members.Add((face, bestScore));
            }
        }

        var merges = mergeGroups.Values
            .OrderByDescending(g => g.Members.Count)
            .Take(MaxSuggestions)
            .Select(g =>
            {
                var members = g.Members.Take(MaxSuggestionFaces).ToList();
                var faceIds = members.Select(m => m.Face.Id).ToList();
                return new MergeSuggestionDto(
                    SuggestionId(g.Person.Id, members.Select(m => m.Face).ToList()),
                    g.Person.Id,
                    g.Person.Name,
                    g.Person.CoverFaceId,
                    g.Members.Count,
                    members.MaxBy(m => m.Face.CoverScore)!.Face.Id,
                    faceIds,
                    members.Select(m => m.Face.PhotoId).Distinct().Take(SamplePhotoLimit).ToList(),
                    members.Average(m => m.Score));
            })
            .ToList();

        // 2) New-person candidates from whatever no existing person claims.
        var newPeople = new List<PersonSuggestionDto>();
        var rest = unassigned.Where(f => !claimed.Contains(f.Id)).ToList();
        if (rest.Count >= 2)
        {
            var assignments = clusterer.Cluster(rest.Select(f => f.Embedding).ToList(), threshold);
            var groups = new Dictionary<int, List<PhotoFace>>();
            for (var i = 0; i < rest.Count; i++)
            {
                if (!groups.TryGetValue(assignments[i], out var members))
                {
                    groups[assignments[i]] = members = [];
                }

                members.Add(rest[i]);
            }

            newPeople = groups.Values
                .Where(members => members.Count >= 2)
                .OrderByDescending(members => members.Count)
                .Take(MaxSuggestions)
                .Select(members => new PersonSuggestionDto(
                    SuggestionId(members),
                    members.Count,
                    members.MaxBy(f => f.CoverScore)!.Id,
                    members.Select(f => f.Id).Take(MaxSuggestionFaces).ToList(),
                    members.Select(f => f.PhotoId).Distinct().Take(SamplePhotoLimit).ToList()))
                .ToList();
        }

        return new PersonSuggestionsDto(newPeople, merges);
    }

    /// <summary>Creates one person from a reviewed suggestion group (doc 18 §7.4).
    /// Faces must exist and belong to the owner; already-assigned faces are skipped
    /// (the clustering job may have caught up between listing and accepting).</summary>
    public async Task<PersonDto> AcceptSuggestionAsync(
        Guid ownerId, IReadOnlyList<Guid> faceIds, CancellationToken cancellationToken = default)
    {
        if (faceIds.Count == 0 || faceIds.Count > MaxSuggestionFaces)
        {
            throw new ValidationException(
                $"A suggestion accepts between 1 and {MaxSuggestionFaces} faces.", ErrorCodes.Validation);
        }

        var targets = new List<PhotoFace>(faceIds.Count);
        foreach (var faceId in faceIds.Distinct())
        {
            var face = await faces.GetByIdAsync(faceId, cancellationToken);
            if (face is null || face.OwnerId != ownerId)
            {
                // Owner check first — someone else's face is 404, never leaked.
                throw new NotFoundException($"Face '{faceId}' was not found.", ErrorCodes.FacesNotFound);
            }

            if (face.PersonId is null)
            {
                targets.Add(face);
            }
        }

        var person = Person.Create(ownerId, dateTime.UtcNow);
        await persons.AddAsync(person, cancellationToken);
        foreach (var face in targets)
        {
            face.PersonId = person.Id;
        }

        if (targets.Count > 0)
        {
            await RecomputeAsync(ownerId, person, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Suggestion accepted: person {Person} created with {Count} face(s) (owner {Owner})",
            person.Id, targets.Count, ownerId);
        return new PersonDto(person.Id, person.Name, person.FaceCount, person.CoverFaceId);
    }

    /// <summary>Assigns reviewed faces into an existing person (the merge half of
    /// the "same person?" review, doc 18 §7.4). Same face rules as accepting a new
    /// person: owner-checked, already-assigned faces skipped.</summary>
    public async Task AcceptMergeSuggestionAsync(
        Guid ownerId, Guid personId, IReadOnlyList<Guid> faceIds, CancellationToken cancellationToken = default)
    {
        if (faceIds.Count == 0 || faceIds.Count > MaxSuggestionFaces)
        {
            throw new ValidationException(
                $"A suggestion accepts between 1 and {MaxSuggestionFaces} faces.", ErrorCodes.Validation);
        }

        var person = await GetPersonOrThrowAsync(ownerId, personId, cancellationToken);
        var assigned = 0;
        foreach (var faceId in faceIds.Distinct())
        {
            var face = await faces.GetByIdAsync(faceId, cancellationToken);
            if (face is null || face.OwnerId != ownerId)
            {
                // Owner check first — someone else's face is 404, never leaked.
                throw new NotFoundException($"Face '{faceId}' was not found.", ErrorCodes.FacesNotFound);
            }

            if (face.PersonId is null)
            {
                face.PersonId = person.Id;
                assigned++;
            }
        }

        if (assigned > 0)
        {
            await RecomputeAsync(ownerId, person, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Merge suggestion accepted: {Count} face(s) into person {Person} (owner {Owner})",
            assigned, person.Id, ownerId);
    }

    /// <summary>Stable id for a suggestion group (hash of the sorted member face ids) —
    /// the key clients use to remember dismissed suggestions.</summary>
    private static string SuggestionId(IReadOnlyList<PhotoFace> members) =>
        Convert.ToHexString(SHA256.HashData(
            members.Select(f => f.Id).OrderBy(id => id).SelectMany(id => id.ToByteArray()).ToArray()))[..16]
            .ToLowerInvariant();

    /// <summary>Person-scoped variant: the hash mixes the target person in, so the
    /// same face set suggested into two people (or later into another person)
    /// gets distinct dismissal keys.</summary>
    private static string SuggestionId(Guid personId, IReadOnlyList<PhotoFace> members) =>
        Convert.ToHexString(SHA256.HashData(
            personId.ToByteArray()
                .Concat(members.Select(f => f.Id).OrderBy(id => id).SelectMany(id => id.ToByteArray()))
                .ToArray()))[..16]
            .ToLowerInvariant();

    /// <summary>Group coherence for the person header (doc 18 §10): mean cosine
    /// similarity of the member faces to the exact centroid. 1 = identical
    /// embeddings; ~0.7+ reads as a tight person. Null when there is nothing to
    /// measure (no members or no centroid yet).</summary>
    private async Task<float?> ConfidenceAsync(Guid ownerId, Person person, CancellationToken cancellationToken)
    {
        if (person.Centroid is null || person.FaceCount == 0)
        {
            return null;
        }

        var members = await faces.ListForPersonAsync(ownerId, person.Id, cancellationToken);
        if (members.Count == 0)
        {
            return null;
        }

        return members.Average(f => TensorPrimitives.CosineSimilarity(f.Embedding, person.Centroid));
    }

    /// <summary>Owner-checked crop blob path for the face-crop endpoint.</summary>
    public async Task<string> GetFaceCropAsync(
        Guid ownerId, Guid faceId, IFaceRepository faceRepository, CancellationToken cancellationToken = default)
    {
        var face = await faceRepository.GetByIdAsync(faceId, cancellationToken);
        if (face is null || face.OwnerId != ownerId)
        {
            throw new NotFoundException($"Face '{faceId}' was not found.", ErrorCodes.FacesNotFound);
        }

        return face.CropBlobPath;
    }

    /// <summary>Exact aggregates from the member faces: count, normalized mean centroid, best-cover face.</summary>
    private async Task RecomputeAsync(Guid ownerId, Person person, CancellationToken cancellationToken)
    {
        // ListForOwner returns tracked entities; filtering client-side keeps this
        // correct for personal-scale libraries without an extra query shape.
        var allFaces = await faces.ListForOwnerAsync(ownerId, cancellationToken);
        var members = allFaces.Where(f => f.PersonId == person.Id).ToList();

        person.FaceCount = members.Count;
        person.Centroid = clusterer.Centroid(members.Select(f => f.Embedding).ToList());
        person.CoverFaceId = members.Count == 0 ? null : members.MaxBy(f => f.CoverScore)!.Id;
        person.Touch(dateTime.UtcNow);
    }

    private async Task<Person> GetPersonOrThrowAsync(Guid ownerId, Guid personId, CancellationToken cancellationToken) =>
        await persons.GetByIdForOwnerAsync(personId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Person '{personId}' was not found.", ErrorCodes.PeopleNotFound);
}

/// <summary>Read-only label queries backing the API endpoints (doc 18 §9).</summary>
public sealed class LabelService(IPhotoLabelRepository labels, IPhotoRepository photos)
{
    public Task<IReadOnlyList<LabelCount>> ListTopAsync(Guid ownerId, int limit, CancellationToken cancellationToken = default) =>
        labels.ListTopForOwnerAsync(ownerId, Math.Clamp(limit, 1, 200), cancellationToken);

    public async Task<PagedResult<PhotoDto>> ListPhotosAsync(
        Guid ownerId, string label, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var result = await labels.ListPhotosForLabelAsync(ownerId, label, page, pageSize, cancellationToken);
        return new PagedResult<PhotoDto>(
            result.Items.Select(p => PhotoDto.From(p, [])).ToList(),
            result.Page, result.PageSize, result.TotalCount);
    }

    public async Task<IReadOnlyList<PhotoLabel>> ListForPhotoAsync(
        Guid ownerId, Guid photoId, CancellationToken cancellationToken = default)
    {
        // Owner check first — labels of someone else's photo are 404, never leaked.
        _ = await photos.GetByIdForOwnerAsync(photoId, ownerId, cancellationToken)
            ?? throw new NotFoundException($"Photo '{photoId}' was not found.", ErrorCodes.PhotosNotFound);
        return await labels.ListByPhotoAsync(photoId, cancellationToken);
    }
}
