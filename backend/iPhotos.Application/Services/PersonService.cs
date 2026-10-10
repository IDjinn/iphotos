using System.Numerics.Tensors;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;

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
    ILogger<PersonService> logger)
{
    public async Task<IReadOnlyList<PersonDto>> ListAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var people = await persons.ListForOwnerAsync(ownerId, cancellationToken);
        return people
            .Select(p => new PersonDto(p.Id, p.Name, p.FaceCount, p.CoverFaceId))
            .ToList();
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
