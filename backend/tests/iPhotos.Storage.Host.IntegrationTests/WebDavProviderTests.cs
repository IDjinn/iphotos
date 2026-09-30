using System.Net;
using DotNet.Testcontainers;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using iPhotos.Storage;
using iPhotos.Storage.Providers;
using WireMock.Server;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;

namespace iPhotos.Storage.Host.IntegrationTests;

/// <summary>WebDAV provider against a real rclone `serve webdav` container.</summary>
public sealed class WebDavFixture : IAsyncLifetime
{
    // Random per run: fixture credentials for the throwaway container only.
    public static string Username { get; } = $"user{Guid.NewGuid():N}"[..16];

    public static string Password { get; } = $"pass-{Guid.NewGuid():N}-a1";

    private readonly IContainer _container = new ContainerBuilder()
        .WithImage("rclone/rclone:latest")
        .WithCommand("serve", "webdav", "/data", "--addr", "0.0.0.0:8080", "--user", Username, "--pass", Password)
        .WithPortBinding(8080, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(8080))
        .Build();

    public WebDavProviderOptions Options { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        Options = new WebDavProviderOptions
        {
            BaseUrl = $"http://{_container.Hostname}:{_container.GetMappedPublicPort(8080)}",
            Username = Username,
            Password = Password,
        };
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

public class WebDavProviderTests(WebDavFixture fixture) : IClassFixture<WebDavFixture>
{
    [Fact]
    public async Task Put_Head_Get_Delete_RoundTrips()
    {
        var store = new WebDavObjectStore(fixture.Options, allowPrivateNetworks: true);
        var bytes = "webdav-roundtrip"u8.ToArray();

        using (var content = new MemoryStream(bytes))
        {
            var written = await store.PutAsync("owner/p3/original.jpg", content, "image/jpeg");
            written.SizeBytes.ShouldBe(bytes.Length);
        }

        (await store.HeadAsync("owner/p3/original.jpg")).SizeBytes.ShouldBe(bytes.Length);

        var read = await store.OpenReadAsync("owner/p3/original.jpg");
        using (read.Content)
        using (var buffer = new MemoryStream())
        {
            await read.Content.CopyToAsync(buffer);
            buffer.ToArray().ShouldBe(bytes);
        }

        await store.DeleteAsync("owner/p3/original.jpg");
        (await Record.ExceptionAsync(() => store.OpenReadAsync("owner/p3/original.jpg")))
            .ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task Put_NestedKey_CreatesCollectionsAndSucceeds()
    {
        var store = new WebDavObjectStore(fixture.Options, allowPrivateNetworks: true);
        using var content = new MemoryStream([1, 2]);

        await store.PutAsync("a/b/c/file.bin", content, null);

        (await store.HeadAsync("a/b/c/file.bin")).SizeBytes.ShouldBe(2);
    }

    [Fact]
    public async Task WrongCredentials_ThrowsProviderException()
    {
        var options = new WebDavProviderOptions
        {
            BaseUrl = fixture.Options.BaseUrl,
            Username = WebDavFixture.Username,
            Password = WebDavFixture.Password + "-invalid",
        };
        var store = new WebDavObjectStore(options, allowPrivateNetworks: true);
        using var content = new MemoryStream([1]);

        (await Record.ExceptionAsync(() => store.PutAsync("x.bin", content, null)))
            .ShouldBeOfType<ProviderException>();
    }

    [Fact]
    public async Task MissingObject_ThrowsObjectNotFound()
    {
        var store = new WebDavObjectStore(fixture.Options, allowPrivateNetworks: true);

        (await Record.ExceptionAsync(() => store.OpenReadAsync("ghost.bin")))
            .ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task PrivateNetworkDisallowed_LoopbackBaseUrl_Throws()
    {
        var options = new WebDavProviderOptions { BaseUrl = "http://127.0.0.1:1", Username = "u", Password = "p" };

        var exception = Record.Exception(() => new WebDavObjectStore(options, allowPrivateNetworks: false));

        exception.ShouldBeOfType<BlockedNetworkException>();
    }
}

/// <summary>WebDAV auth/rejection edge cases with a programmable fake server.</summary>
public class WebDavWireMockTests : IDisposable
{
    private readonly WireMockServer _server = WireMockServer.Start();

    public void Dispose() => _server.Stop();

    private WebDavObjectStore CreateStore() => new(
        new WebDavProviderOptions { BaseUrl = _server.Urls[0], Username = "u", Password = "p" },
        _server.CreateClient(),
        allowPrivateNetworks: true,
        ownsHttpClient: false);

    [Fact]
    public async Task Put_ServerError_ThrowsProviderException()
    {
        _server
            .Given(Request.Create().WithPath("/x.bin").UsingPut())
            .RespondWith(Response.Create().WithStatusCode(HttpStatusCode.InsufficientStorage));

        var store = CreateStore();
        using var content = new MemoryStream([1]);

        (await Record.ExceptionAsync(() => store.PutAsync("x.bin", content, null)))
            .ShouldBeOfType<ProviderException>();
    }

    [Fact]
    public async Task Head_Missing_ReturnsObjectNotFound()
    {
        _server
            .Given(Request.Create().WithPath("/gone.bin").UsingHead())
            .RespondWith(Response.Create().WithStatusCode(HttpStatusCode.NotFound));

        var store = CreateStore();

        (await Record.ExceptionAsync(() => store.HeadAsync("gone.bin")))
            .ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task Delete_Missing_IsIdempotent()
    {
        _server
            .Given(Request.Create().WithPath("/gone.bin").UsingDelete())
            .RespondWith(Response.Create().WithStatusCode(HttpStatusCode.NotFound));

        var store = CreateStore();

        await Should.NotThrowAsync(() => store.DeleteAsync("gone.bin"));
    }
}
