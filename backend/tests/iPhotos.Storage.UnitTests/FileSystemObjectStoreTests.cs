using iPhotos.Storage;
using iPhotos.Storage.Providers;

namespace iPhotos.Storage.UnitTests;

public class FileSystemObjectStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "iphotos-fs-" + Guid.NewGuid().ToString("N"));
    private readonly FileSystemObjectStore _store;

    public FileSystemObjectStoreTests()
    {
        _store = new FileSystemObjectStore(new FileSystemProviderOptions { RootPath = _root });
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public async Task Put_OpenReadDelete_RoundTrips()
    {
        var bytes = "hello storage"u8.ToArray();
        using (var content = new MemoryStream(bytes))
        {
            var result = await _store.PutAsync("owner/photo/original.jpg", content, "image/jpeg");
            result.SizeBytes.ShouldBe(bytes.Length);
        }

        var read = await _store.OpenReadAsync("owner/photo/original.jpg");
        using (read.Content)
        using (var buffer = new MemoryStream())
        {
            await read.Content.CopyToAsync(buffer);
            buffer.ToArray().ShouldBe(bytes);
            read.ContentType.ShouldBe("image/jpeg");
            read.SizeBytes.ShouldBe(bytes.Length);
        }

        var head = await _store.HeadAsync("owner/photo/original.jpg");
        head.SizeBytes.ShouldBe(bytes.Length);

        await _store.DeleteAsync("owner/photo/original.jpg");
        (await Record.ExceptionAsync(() => _store.OpenReadAsync("owner/photo/original.jpg")))
            .ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task Put_CreatesNestedDirectories()
    {
        using var content = new MemoryStream([1, 2, 3]);
        await _store.PutAsync("a/b/c/d.bin", content, null);

        (await _store.HeadAsync("a/b/c/d.bin")).SizeBytes.ShouldBe(3);
    }

    [Fact]
    public async Task Put_SameKeyOverwrites()
    {
        using (var first = new MemoryStream([1]))
        {
            await _store.PutAsync("k.bin", first, null);
        }

        using (var second = new MemoryStream([9, 9]))
        {
            await _store.PutAsync("k.bin", second, null);
        }

        var read = await _store.OpenReadAsync("k.bin");
        using (read.Content)
        using (var buffer = new MemoryStream())
        {
            await read.Content.CopyToAsync(buffer);
            buffer.ToArray().ShouldBe([9, 9]);
        }
    }

    [Fact]
    public async Task OpenRead_Missing_ThrowsObjectNotFound()
    {
        var exception = await Record.ExceptionAsync(() => _store.OpenReadAsync("missing.bin"));

        var notFound = exception.ShouldBeOfType<ObjectNotFoundException>();
        notFound.Message.ShouldContain("missing.bin");
    }

    [Fact]
    public async Task Delete_Missing_IsIdempotent()
    {
        await Should.NotThrowAsync(() => _store.DeleteAsync("never-existed.bin"));
    }

    [Fact]
    public async Task Put_TraversalKey_Throws()
    {
        using var content = new MemoryStream([1]);

        await Should.ThrowAsync<InvalidObjectKeyException>(
            () => _store.PutAsync("../escape.bin", content, null));
    }

    [Fact]
    public async Task TryPresign_NeverPresigns()
    {
        (await _store.TryPresignGetAsync("a.bin", TimeSpan.FromMinutes(5))).ShouldBeNull();
    }
}
