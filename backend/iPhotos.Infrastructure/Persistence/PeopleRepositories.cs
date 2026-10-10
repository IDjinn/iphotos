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

    public async Task ReassignAsync(Guid fromPersonId, Guid? toPersonId, CancellationToken cancellationToken = default)
    {
        await db.PhotoFaces
            .Where(f => f.PersonId == fromPersonId)
            .ExecuteUpdateAsync(set => set.SetProperty(f => f.PersonId, toPersonId), cancellationToken);
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

    public async Task<IReadOnlyList<LabelCount>> ListTopForOwnerAsync(Guid ownerId, int limit, CancellationToken cancellationToken = default) =>
        await db.PhotoLabels
            .Where(l => l.OwnerId == ownerId)
            .GroupBy(l => l.Label)
            .Select(group => new LabelCount(group.Key, group.Select(l => l.PhotoId).Distinct().Count()))
            .OrderByDescending(c => c.Count)
            .ThenBy(c => c.Label)
            .Take(limit)
            .ToListAsync(cancellationToken);

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
