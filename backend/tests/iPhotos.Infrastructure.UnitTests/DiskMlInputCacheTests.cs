using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Infrastructure.Ai;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.UnitTests;

/// <summary>Disk roundtrip of the ML input cache (doc 18 §6.2): save → open → delete,
/// plus the stale sweep for orphaned files.</summary>
public class DiskMlInputCacheTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"iphotos-ml-cache-tests-{Guid.NewGuid():N}");

    private DiskMlInputCache NewCache() => new(
        Options.Create(new MlOptions { InputCacheDir = _root }),
        NullLogger<DiskMlInputCache>.Instance);

    [Fact]
    public async Task Save_TryOpen_Delete_RoundTripsBytesAndRewindsTheSource()
    {
        var cache = NewCache();
        var photoId = Guid.NewGuid();
        var source = new MemoryStream([1, 2, 3, 4]);

        await cache.SaveAsync(photoId, MlInputKind.Preview, source);

        source.Position.ShouldBe(0); // caller can hand the stream straight to blob storage

        await using (var opened = await cache.TryOpenReadAsync(photoId, MlInputKind.Preview))
        {
            opened.ShouldNotBeNull();
            using var buffer = new MemoryStream();
            await opened.CopyToAsync(buffer);
            buffer.ToArray().ShouldBe([1, 2, 3, 4]);
        }

        cache.Delete(photoId, MlInputKind.Preview);
        (await cache.TryOpenReadAsync(photoId, MlInputKind.Preview)).ShouldBeNull();
    }

    [Fact]
    public async Task Save_OverwritesPreviousBytes()
    {
        var cache = NewCache();
        var photoId = Guid.NewGuid();

        await cache.SaveAsync(photoId, MlInputKind.Preview, new MemoryStream([1]));
        await cache.SaveAsync(photoId, MlInputKind.Preview, new MemoryStream([2, 2]));

        await using var opened = await cache.TryOpenReadAsync(photoId, MlInputKind.Preview);
        using var buffer = new MemoryStream();
        await opened!.CopyToAsync(buffer);
        buffer.ToArray().ShouldBe([2, 2]);
    }

    [Fact]
    public async Task DeleteStale_RemovesOnlyFilesOlderThanTheCutoff()
    {
        var cache = NewCache();
        var fresh = Guid.NewGuid();
        var stale = Guid.NewGuid();

        await cache.SaveAsync(fresh, MlInputKind.Preview, new MemoryStream([1]));
        await cache.SaveAsync(stale, MlInputKind.Thumbnail, new MemoryStream([1]));
        File.SetLastWriteTimeUtc(
            Path.Combine(_root, $"{stale:N}.thumbnail.jpg"), DateTime.UtcNow - TimeSpan.FromDays(3));

        await cache.DeleteStaleAsync(TimeSpan.FromHours(48));

        File.Exists(Path.Combine(_root, $"{fresh:N}.preview.jpg")).ShouldBeTrue();
        File.Exists(Path.Combine(_root, $"{stale:N}.thumbnail.jpg")).ShouldBeFalse();
    }

    [Fact]
    public async Task TryOpen_MissingFile_ReturnsNullWithoutThrowing()
    {
        var cache = NewCache();

        (await cache.TryOpenReadAsync(Guid.NewGuid(), MlInputKind.Preview)).ShouldBeNull();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
