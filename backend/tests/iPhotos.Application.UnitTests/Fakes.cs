using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.UnitTests;

public sealed class StubDateTimeProvider(DateTimeOffset now) : IDateTimeProvider
{
    public DateTimeOffset UtcNow => now;
}

public sealed class FakePasswordHasher : IPasswordHasher
{
    public string Hash(string password) => "fake$" + password;

    public bool Verify(string password, string hash) => hash == "fake$" + password;
}

public sealed class FakeTokenService : ITokenService
{
    private int _counter;

    public DateTimeOffset RefreshExpiry { get; set; } = new(2026, 1, 31, 0, 0, 0, TimeSpan.Zero);

    public string IssueAccessToken(Guid userId, string email) => $"access:{userId}";

    public Task<Guid> ValidateAccessTokenAsync(string accessToken, CancellationToken cancellationToken = default)
        => Task.FromResult(Guid.Parse(accessToken["access:".Length..]));

    public RefreshTokenIssue GenerateRefreshToken()
    {
        var plain = $"refresh-{++_counter}";
        return new RefreshTokenIssue(plain, HashRefreshToken(plain), RefreshExpiry);
    }

    public string HashRefreshToken(string plainToken) => $"hash-{plainToken}";
}

public sealed class InMemoryUserRepository : IUserRepository
{
    public List<User> Users { get; } = [];

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
        => Task.FromResult(Users.FirstOrDefault(u => u.Email == email));

    public Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Users.FirstOrDefault(u => u.Id == id));

    public Task<User> AddAsync(User user, CancellationToken cancellationToken = default)
    {
        Users.Add(user);
        return Task.FromResult(user);
    }
}

public sealed class InMemoryRefreshTokenRepository : IRefreshTokenRepository
{
    public List<RefreshToken> Tokens { get; } = [];

    public Task AddAsync(RefreshToken token, CancellationToken cancellationToken = default)
    {
        Tokens.Add(token);
        return Task.CompletedTask;
    }

    public Task<RefreshToken?> FindByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
        => Task.FromResult(Tokens.FirstOrDefault(t => t.TokenHash == tokenHash));
}

public sealed class InMemoryPhotoRepository : IPhotoRepository
{
    public List<Photo> Photos { get; } = [];

    public Task<Photo> AddAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        Photos.Add(photo);
        return Task.FromResult(photo);
    }

    public Task<Photo?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.Id == id));

    public Task<Photo?> GetByIdForOwnerAsync(Guid id, Guid ownerId, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.Id == id && p.OwnerId == ownerId));

    public Task<Photo?> FindByContentHashAsync(Guid ownerId, string contentHash, CancellationToken cancellationToken = default)
        => Task.FromResult(Photos.FirstOrDefault(p => p.OwnerId == ownerId && p.ContentHash == contentHash));

    public Task<PagedResult<Photo>> ListAsync(PhotoFilter filter, CancellationToken cancellationToken = default)
    {
        IEnumerable<Photo> query = Photos.Where(p => p.OwnerId == filter.OwnerId);

        if (filter.From is not null)
        {
            query = query.Where(p => p.TakenAt >= filter.From);
        }

        if (filter.To is not null)
        {
            query = query.Where(p => p.TakenAt <= filter.To);
        }

        if (!string.IsNullOrWhiteSpace(filter.FileName))
        {
            query = query.Where(p => p.FileName.Contains(filter.FileName, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(filter.Camera))
        {
            query = query.Where(p =>
                (p.CameraMake ?? string.Empty).Contains(filter.Camera, StringComparison.OrdinalIgnoreCase)
                || (p.CameraModel ?? string.Empty).Contains(filter.Camera, StringComparison.OrdinalIgnoreCase));
        }

        var ordered = query
            .OrderByDescending(p => p.TakenAt ?? DateTimeOffset.MinValue)
            .ThenByDescending(p => p.CreatedAt)
            .ToList();
        var total = ordered.Count;
        var items = ordered
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToList();

        return Task.FromResult(new PagedResult<Photo>(items, filter.Page, filter.PageSize, total));
    }

    public Task DeleteAsync(Photo photo, CancellationToken cancellationToken = default)
    {
        Photos.Remove(photo);
        return Task.CompletedTask;
    }

    public Task<UsageStats> GetUsageAsync(Guid ownerId, CancellationToken cancellationToken = default)
    {
        var owned = Photos.Where(p => p.OwnerId == ownerId).ToList();
        return Task.FromResult(new UsageStats(owned.Sum(p => p.SizeBytes), owned.Count, 0));
    }
}

public sealed class InMemoryVariantRepository : IVariantRepository
{
    public List<PhotoVariant> Variants { get; } = [];

    public Task AddAsync(PhotoVariant variant, CancellationToken cancellationToken = default)
    {
        Variants.Add(variant);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PhotoVariant>> ListByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<PhotoVariant>>(Variants.Where(v => v.PhotoId == photoId).ToList());

    public Task DeleteByPhotoAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        Variants.RemoveAll(v => v.PhotoId == photoId);
        return Task.CompletedTask;
    }
}

public sealed class InMemoryVariantJobRepository : IVariantJobRepository
{
    public List<VariantJob> Jobs { get; } = [];

    public Task<VariantJob> EnqueueAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        var job = VariantJob.Create(photoId, new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        Jobs.Add(job);
        return Task.FromResult(job);
    }

    public Task<VariantJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        var job = Jobs.FirstOrDefault(j => j.State == JobState.Queued);
        if (job is not null)
        {
            job.Start();
        }

        return Task.FromResult(job);
    }
}

public sealed class FakeBlobStorage : IBlobStorage
{
    public Dictionary<string, byte[]> Blobs { get; } = [];

    public Task PutAsync(string path, Stream content, CancellationToken cancellationToken = default)
    {
        using var buffer = new MemoryStream();
        content.CopyTo(buffer);
        Blobs[path] = buffer.ToArray();
        return Task.CompletedTask;
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
        => Blobs.TryGetValue(path, out var bytes)
            ? Task.FromResult<Stream>(new MemoryStream(bytes, writable: false))
            : throw new KeyNotFoundException($"Blob '{path}' not found.");

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        Blobs.Remove(path);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
        => Task.FromResult(Blobs.ContainsKey(path));
}

public sealed class FakeUnitOfWork : IUnitOfWork
{
    public int SaveCount { get; private set; }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveCount++;
        return Task.FromResult(0);
    }
}

public sealed class FakeImageVariantGenerator : IImageVariantGenerator
{
    public Exception? ThrowOnGenerate { get; set; }

    public Task<VariantOutput> GenerateAsync(Stream original, VariantKind kind, CancellationToken cancellationToken = default)
    {
        if (ThrowOnGenerate is not null)
        {
            throw ThrowOnGenerate;
        }

        var bytes = System.Text.Encoding.UTF8.GetBytes($"variant-{kind}");
        return Task.FromResult(new VariantOutput(new MemoryStream(bytes), 10, 5, "jpeg", bytes.Length));
    }
}

public sealed class FakeExifExtractor : IExifExtractor
{
    public PhotoMetadata Metadata { get; set; } = new(
        4032, 3024,
        new DateTimeOffset(2025, 12, 25, 10, 30, 0, TimeSpan.Zero),
        "Google", "Pixel 9", -22.9, -43.2);

    public Task<PhotoMetadata> ExtractAsync(Stream original, CancellationToken cancellationToken = default)
        => Task.FromResult(Metadata);
}
