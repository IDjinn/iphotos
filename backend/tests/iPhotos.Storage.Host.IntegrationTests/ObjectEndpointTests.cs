using System.Net.Http.Json;
using System.Text;
using iPhotos.Storage;

namespace iPhotos.Storage.Host.IntegrationTests;

public class ObjectEndpointTests : IClassFixture<StorageHostFactory>
{
    private readonly StorageHostFactory _factory;
    private readonly StorageHostClient _client;

    public ObjectEndpointTests(StorageHostFactory factory)
    {
        _factory = factory;
        _client = new StorageHostClient(factory);
    }

    [Fact]
    public async Task Put_GetViaSignedUrl_Delete_FullRoundTrip()
    {
        var bytes = "round-trip-payload"u8.ToArray();

        var putResponse = await _client.Client.SendAsync(_client.Put("owner/p1/original.jpg", bytes, "image/jpeg"));
        putResponse.StatusCode.ShouldBe(System.Net.HttpStatusCode.Created);
        var upload = await putResponse.Content.ReadFromJsonAsync<StorageHostClient.UploadResponse>(StorageHostClient.JsonOptions.Web);
        upload.ShouldNotBeNull();
        upload.Provider.ShouldBe("filesystem");
        upload.SizeBytes.ShouldBe(bytes.Length);
        upload.Url.ShouldContain("/api/objects/owner/p1/original.jpg");
        upload.Url.ShouldContain("sig=");

        // The signed URL must grant GET without any API key.
        var getUrl = await _client.Client.GetAsync(upload.Url);
        getUrl.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
        (await getUrl.Content.ReadAsByteArrayAsync()).ShouldBe(bytes);
        getUrl.Content.Headers.ContentType?.MediaType.ShouldBe("image/jpeg");

        // Api-key GET works too.
        var getAuthorized = await _client.Client.SendAsync(_client.Authorized(
            new HttpRequestMessage(HttpMethod.Get, "/api/objects/owner/p1/original.jpg")));
        getAuthorized.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);

        var deleted = await _client.Client.SendAsync(_client.Delete("owner/p1/original.jpg"));
        deleted.StatusCode.ShouldBe(System.Net.HttpStatusCode.NoContent);

        var afterDelete = await _client.Client.SendAsync(_client.Authorized(
            new HttpRequestMessage(HttpMethod.Get, "/api/objects/owner/p1/original.jpg")));
        afterDelete.StatusCode.ShouldBe(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Put_WithoutApiKey_Returns401()
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/objects/a.bin")
        {
            Content = new ByteArrayContent([1]),
        };

        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_WithoutApiKeyOrSignature_Returns401()
    {
        await _client.PutAsync("private.bin", [1, 2, 3]);

        var response = await _client.Client.GetAsync("/api/objects/private.bin");

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_TamperedSignature_Returns401()
    {
        await _client.PutAsync("guarded.bin", [7, 7, 7]);
        var signer = new HmacUrlSigner(StorageHostFactory.SigningKey);
        var expires = DateTimeOffset.UtcNow.AddMinutes(5);
        var signature = signer.Sign("GET", "filesystem", "guarded.bin", expires);
        var tampered = $"/api/objects/guarded.bin?provider=filesystem&exp={expires.ToUnixTimeSeconds()}&sig={signature}x";

        var response = await _client.Client.GetAsync(tampered);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_ExpiredSignature_Returns401()
    {
        await _client.PutAsync("old.bin", [8]);
        var signer = new HmacUrlSigner(StorageHostFactory.SigningKey);
        var expired = DateTimeOffset.UtcNow.AddMinutes(-5);
        var signature = signer.Sign("GET", "filesystem", "old.bin", expired);
        var url = $"/api/objects/old.bin?provider=filesystem&exp={expired.ToUnixTimeSeconds()}&sig={signature}";

        var response = await _client.Client.GetAsync(url);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Head_ReturnsLengthWithoutBody()
    {
        var bytes = new byte[] { 1, 2, 3, 4, 5 };
        await _client.PutAsync("head.bin", bytes);

        using var request = new HttpRequestMessage(HttpMethod.Head, "/api/objects/head.bin");
        request.Headers.Add("X-Api-Key", _client.ApiKey);
        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
        response.Content.Headers.ContentLength.ShouldBe(bytes.Length);
        (await response.Content.ReadAsByteArrayAsync()).ShouldBeEmpty();
    }

    [Fact]
    public async Task Get_RangeRequest_Returns206WithSlice()
    {
        var bytes = Enumerable.Range(0, 100).Select(i => (byte)i).ToArray();
        await _client.PutAsync("range.bin", bytes);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/objects/range.bin");
        request.Headers.Add("X-Api-Key", _client.ApiKey);
        request.Headers.Range = new(0, 9);
        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.PartialContent);
        (await response.Content.ReadAsByteArrayAsync()).ShouldBe(bytes[..10]);
    }

    [Fact]
    public async Task Put_InvalidKey_Returns400()
    {
        var response = await _client.Client.SendAsync(_client.Put("..%2Fescape.bin", [1]));

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Put_UnknownProvider_Returns400()
    {
        var response = await _client.Client.SendAsync(_client.Put("a.bin", [1], provider: "dropbox"));

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Put_SameKeyOverwrites()
    {
        await _client.PutAsync("dup.bin", [1]);
        await _client.PutAsync("dup.bin", [9, 9]);

        using var request = _client.Authorized(new HttpRequestMessage(HttpMethod.Get, "/api/objects/dup.bin"));
        var response = await _client.Client.SendAsync(request);
        (await response.Content.ReadAsByteArrayAsync()).ShouldBe([9, 9]);
    }

    [Fact]
    public async Task CreateUrl_ForExistingKey_ReturnsFreshWorkingUrl()
    {
        await _client.PutAsync("resign.bin", [4, 4]);

        using var request = _client.Authorized(
            new HttpRequestMessage(HttpMethod.Post, "/api/objects/url?key=resign.bin&expirySeconds=60"));
        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<StorageHostClient.UploadResponse>(StorageHostClient.JsonOptions.Web);
        body.ShouldNotBeNull();
        var fresh = await _client.Client.GetAsync(body.Url);
        fresh.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
    }

    [Fact]
    public async Task CreateUrl_ForMissingKey_Returns404()
    {
        using var request = _client.Authorized(
            new HttpRequestMessage(HttpMethod.Post, "/api/objects/url?key=never.bin"));
        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task CreateUrl_RequiresApiKey_Returns401Without()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/objects/url?key=whatever.bin");
        var response = await _client.Client.SendAsync(request);

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        var response = await _client.Client.GetAsync("/health");

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
    }

    [Fact]
    public async Task Providers_ListsConfiguredFilesystemAsDefault()
    {
        var response = await _client.Client.SendAsync(_client.Authorized(
            new HttpRequestMessage(HttpMethod.Get, "/api/providers")));

        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        json.ShouldContain("\"filesystem\"");
        json.ShouldContain("\"isDefault\":true");
        json.ShouldNotContain("s3"); // unconfigured providers are not listed
    }

    [Fact]
    public async Task Put_NestedKey_CreatesStructureOnDisk()
    {
        await _client.PutAsync("deep/nest/ed/file.jpg", Encoding.ASCII.GetBytes("x"));

        File.Exists(Path.Combine(_factory.RootPath, "deep", "nest", "ed", "file.jpg")).ShouldBeTrue();
    }
}
