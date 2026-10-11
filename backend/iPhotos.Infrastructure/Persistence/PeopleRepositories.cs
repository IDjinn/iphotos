using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Infrastructure.Persistence;

public sealed class PersonRepository(PhotosDbContext db) : IPersonRepository
{
    public async Task AddAsync(Person person, CancellationToken cancellationToken = default)
    {
        db.Persons.Add(person);
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<Person?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default) =>
        db.Persons.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == ownerId, cancellationToken);

    public async Task<IReadOnlyList<Person>> ListForOwnerAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
        await db.Persons
            .Where(p => p.OwnerId == ownerId)
            .OrderByDescending(p => p.FaceCount)
            .ThenBy(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task DeleteAsync(Person person, CancellationToken cancellationToken = default)
    {
        db.Persons.Remove(person);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteRangeAsync(IReadOnlyList<Person> persons, CancellationToken cancellationToken = default)
    {
        if (persons.Count == 0)
        {
            return;
        }

        var ids = persons.Select(p => p.Id).ToList();
        await db.Persons
            .Where(p => ids.Contains(p.Id))
            .ExecuteDeleteAsync(cancellationToken);
    }
}

public sealed class FaceRepository(PhotosDbContext db) : IFaceRepository
{
    public async Task AddRangeAsync(IReadOnlyList<PhotoFace> faces, CancellationToken cancellationToken = default)
    {
        if (faces.Count == 0)
        {
            return;
        }

        db.PhotoFaces.AddRange(faces);
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<PhotoFace?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        db.PhotoFaces.FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

    public async Task<IReadOnlyList<PhotoFace>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default) =>
        await db.PhotoFaces.Where(f => f.PhotoId == photoId).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<PhotoFace>> ListForOwnerAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
        await db.PhotoFaces.Where(f => f.OwnerId == ownerId).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<PhotoFace>> ListForPersonAsync(
        Guid ownerId, Guid personId, CancellationToken cancellationToken = default) =>
        await db.PhotoFaces
            .Where(f => f.OwnerId == ownerId && f.PersonId == personId)
            .ToListAsync(cancellationToken);

    public async Task ReassignAsync(Guid fromPersonId, Guid? toPersonId, CancellationToken cancellationToken = default)
    {
        await db.PhotoFaces
            .Where(f => f.PersonId == fromPersonId)
            .ExecuteUpdateAsync(set => set.SetProperty(f => f.PersonId, toPersonId), cancellationToken);
    }

    public async Task ReassignManyAsync(
        IReadOnlyList<Guid> fromPersonIds, Guid? toPersonId, CancellationToken cancellationToken = default)
    {
        if (fromPersonIds.Count == 0)
        {
            return;
        }

        await db.PhotoFaces
            .Where(f => f.PersonId != null && fromPersonIds.Contains(f.PersonId.Value))
            .ExecuteUpdateAsync(set => set.SetProperty(f => f.PersonId, toPersonId), cancellationToken);
    }

    public async Task<IReadOnlyList<Guid>> ListOwnedIdsAsync(
        Guid ownerId, IReadOnlyList<Guid> faceIds, CancellationToken cancellationToken = default)
    {
        if (faceIds.Count == 0)
        {
            return [];
        }

        IReadOnlyList<Guid> owned = await db.PhotoFaces
            .Where(f => f.OwnerId == ownerId && faceIds.Contains(f.Id))
            .Select(f => f.Id)
            .ToListAsync(cancellationToken);
        return owned;
    }

    public async Task<int> AssignUnassignedManyAsync(
        IReadOnlyList<Guid> faceIds, Guid personId, CancellationToken cancellationToken = default)
    {
        if (faceIds.Count == 0)
        {
            return 0;
        }

        return await db.PhotoFaces
            .Where(f => f.PersonId == null && faceIds.Contains(f.Id))
            .ExecuteUpdateAsync(set => set.SetProperty(f => f.PersonId, personId), cancellationToken);
    }

    public async Task<PagedResult<Photo>> ListPhotosForPersonAsync(
        Guid ownerId, Guid personId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var query =
            from face in db.PhotoFaces
            join photo in db.Photos on face.PhotoId equals photo.Id
            where face.OwnerId == ownerId && face.PersonId == personId
            select photo;

        var total = await query.Distinct().CountAsync(cancellationToken);
        var items = await query
            .Distinct()
            .OrderByDescending(p => p.TakenAt ?? p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Photo>(items, page, pageSize, total);
    }
}

public sealed class PhotoLabelRepository(PhotosDbContext db) : IPhotoLabelRepository
{
    public async Task ReplaceForPhotoAsync(
        Photo photo, IReadOnlyList<PhotoLabel> labels, CancellationToken cancellationToken = default)
    {
        var existing = await db.PhotoLabels.Where(l => l.PhotoId == photo.Id).ToListAsync(cancellationToken);
        db.PhotoLabels.RemoveRange(existing);
        db.PhotoLabels.AddRange(labels);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PhotoLabel>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default) =>
        await db.PhotoLabels
            .Where(l => l.PhotoId == photoId)
            .OrderByDescending(l => l.Score)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<LabelCount>> ListTopForOwnerAsync(Guid ownerId, int limit, CancellationToken cancellationToken = default)
    {
        // Raw SQL: EF Core cannot translate COUNT(DISTINCT ...) inside a GroupBy
        // projection (nor GroupBy over a Distinct subquery) and throws at runtime.
        var rows = await db.Database
            .SqlQuery<LabelCount>(
                $"""
                SELECT label AS "Label", COUNT(DISTINCT photo_id)::int AS "Count"
                FROM photo_labels
                WHERE owner_id = {ownerId}
                GROUP BY label
                ORDER BY "Count" DESC, "Label"
                LIMIT {limit}
                """)
            .ToListAsync(cancellationToken);
        return rows;
    }

    public async Task<PagedResult<Photo>> ListPhotosForLabelAsync(
        Guid ownerId, string label, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var query =
            from pl in db.PhotoLabels
            join photo in db.Photos on pl.PhotoId equals photo.Id
            where pl.OwnerId == ownerId && pl.Label == PhotoLabel.Normalize(label)
            select photo;

        var total = await query.Distinct().CountAsync(cancellationToken);
        var items = await query
            .Distinct()
            .OrderByDescending(p => p.TakenAt ?? p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Photo>(items, page, pageSize, total);
    }
}

public sealed class FaceReviewRepository(PhotosDbContext db) : IFaceReviewRepository
{
    public async Task<IReadOnlyList<FaceReviewDecision>> ListForOwnerAsync(
        Guid ownerId, CancellationToken cancellationToken = default) =>
        await db.FaceReviewDecisions
            .Where(d => d.OwnerId == ownerId)
            .ToListAsync(cancellationToken);

    public async Task AddRangeAsync(
        IReadOnlyList<FaceReviewDecision> decisions, CancellationToken cancellationToken = default)
    {
        if (decisions.Count == 0)
        {
            return;
        }

        db.FaceReviewDecisions.AddRange(decisions);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReassignPersonAsync(
        Guid fromPersonId, Guid toPersonId, CancellationToken cancellationToken = default)
    {
        await db.FaceReviewDecisions
            .Where(d => d.PersonId == fromPersonId)
            .ExecuteUpdateAsync(set => set.SetProperty(d => d.PersonId, toPersonId), cancellationToken);
    }

    public async Task DeleteForPersonAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        await db.FaceReviewDecisions
            .Where(d => d.PersonId == personId)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
