using System.Net;
using iPhotos.Application;
using iPhotos.Infrastructure.Storage;
using iPhotos.Storage;

namespace iPhotos.Infrastructure.UnitTests;

/// <summary>Programmable in-memory HttpMessageHandler recording the last request.</summary>
public sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
{
    public Func<HttpRequestMessage, HttpResponseMessage> Responder { get; set; } = responder;

    public HttpRequestMessage? LastRequest { get; private set; }

    public byte[]? LastBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastRequest = request;
        if (request.Content is not null)
        {
            LastBody = await request.Content.ReadAsByteArrayAsync(cancellationToken);
        }

        return Responder(request);
    }
}

public class HttpBlobStorageTests : IDisposable
{
    private const string BaseUrl = "http://storage.invalid";

    private readonly StubHandler _handler;
    private readonly HttpBlobStorage _storage;

    // Random per run: fixture value for the fake HTTP handler only.
    public static string TestApiKey { get; } = $"key-{Guid.NewGuid():N}";

    public HttpBlobStorageTests()
    {
        _handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        _storage = new HttpBlobStorage(
            new HttpBlobStorageOptions
            {
                BaseUrl = BaseUrl,
                ApiKey = TestApiKey,
                AllowPrivateNetworks = true, // 'storage.invalid' cannot resolve in tests
            },
            _handler);
    }

    public void Dispose() => _storage.Dispose();

    [Fact]
    public async Task Put_SendsBodyWithApiKeyAndEscapedKey()
    {
        var bytes = "payload"u8.ToArray();
        using var content = new MemoryStream(bytes);

        await _storage.PutAsync("owner1/photo/original.jpg", content);

        _handler.LastRequest.ShouldNotBeNull();
        _handler.LastRequest.Method.ShouldBe(HttpMethod.Put);
        _handler.LastRequest.RequestUri!.ToString().ShouldBe($"{BaseUrl}/api/objects/owner1/photo/original.jpg");
        _handler.LastRequest.Headers.GetValues("X-Api-Key").ShouldBe([TestApiKey]);
        _handler.LastBody.ShouldBe(bytes);
    }

    [Fact]
    public async Task Put_ProviderConfigured_AppendsProviderQuery()
    {
        _storage.Dispose();
        using var withProvider = new HttpBlobStorage(
            new HttpBlobStorageOptions
            {
                BaseUrl = BaseUrl,
                ApiKey = TestApiKey,
                Provider = "s3",
                AllowPrivateNetworks = true,
            },
            _handler);
        using var content = new MemoryStream([1]);

        await withProvider.PutAsync("a.bin", content);

        _handler.LastRequest!.RequestUri!.Query.ShouldBe("?provider=s3");
    }

    [Fact]
    public async Task OpenRead_BuffersSeekableContent()
    {
        var bytes = "file-bytes"u8.ToArray();
        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(bytes),
        };

        using var stream = await _storage.OpenReadAsync("a.bin");

        stream.CanSeek.ShouldBeTrue();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer);
        buffer.ToArray().ShouldBe(bytes);
        _handler.LastRequest!.Method.ShouldBe(HttpMethod.Get);
    }

    [Fact]
    public async Task OpenRead_NotFound_ThrowsFileNotFoundException()
    {
        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        var exception = await Record.ExceptionAsync(() => _storage.OpenReadAsync("ghost.bin"));

        exception.ShouldBeOfType<FileNotFoundException>();
    }

    [Fact]
    public async Task Delete_MissingObject_IsIdempotent()
    {
        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        await Should.NotThrowAsync(() => _storage.DeleteAsync("ghost.bin"));
    }

    [Fact]
    public async Task Delete_ServerError_Throws()
    {
        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.InsufficientStorage);

        var exception = await Record.ExceptionAsync(() => _storage.DeleteAsync("a.bin"));

        exception.ShouldBeOfType<IOException>();
    }

    [Fact]
    public async Task Exists_ReflectsHeadStatus()
    {
        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK);
        (await _storage.ExistsAsync("a.bin")).ShouldBeTrue();

        _handler.Responder = _ => new HttpResponseMessage(HttpStatusCode.NotFound);
        (await _storage.ExistsAsync("a.bin")).ShouldBeFalse();
    }

    [Fact]
    public void MissingBaseUrl_Throws()
    {
        Should.Throw<InvalidOperationException>(() => new HttpBlobStorage(new HttpBlobStorageOptions()));
    }

    [Fact]
    public void PrivateBaseUrlNotAllowed_ThrowsBlockedNetwork()
    {
        var exception = Record.Exception(() => new HttpBlobStorage(
            new HttpBlobStorageOptions { BaseUrl = "http://127.0.0.1:5206", AllowPrivateNetworks = false }, _handler));

        exception.ShouldBeOfType<BlockedNetworkException>();
    }
}
