using System.Net.Http.Json;
using System.Text.Json;
using iPhotos.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace iPhotos.Storage.Host.IntegrationTests;

/// <summary>Boots the storage host with a temp-dir filesystem provider and fixed test keys.</summary>
public sealed class StorageHostFactory : WebApplicationFactory<Program>
{
    // Random per test run: fixture secrets, not real credentials.
    public static string ApiKey { get; } = $"test-{Guid.NewGuid():N}";

    public static string SigningKey { get; } = new string('s', 32);

    public string RootPath { get; } = Path.Combine(Path.GetTempPath(), "iphotos-storage-" + Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:ApiKey"] = ApiKey,
            ["Storage:SigningKey"] = SigningKey,
            ["Storage:DefaultProvider"] = "filesystem",
            ["Storage:AllowPrivateNetworks"] = "true",
            ["Providers:FileSystem:RootPath"] = RootPath,
        }));
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        if (Directory.Exists(RootPath))
        {
            Directory.Delete(RootPath, recursive: true);
        }
    }
}

public sealed class StorageHostClient
{
    public StorageHostClient(StorageHostFactory factory)
    {
        Client = factory.CreateClient();
        ApiKey = StorageHostFactory.ApiKey;
    }

    public HttpClient Client { get; }

    public string ApiKey { get; }

    public HttpRequestMessage Put(string key, byte[] bytes, string? contentType = "application/octet-stream", string? provider = null)
    {
        var url = $"/api/objects/{key}";
        if (provider is not null)
        {
            url += $"?provider={provider}";
        }

        var request = new HttpRequestMessage(HttpMethod.Put, url) { Content = new ByteArrayContent(bytes) };
        if (contentType is not null)
        {
            request.Content.Headers.ContentType = new(contentType);
        }

        request.Headers.Add("X-Api-Key", ApiKey);
        return request;
    }

    public HttpRequestMessage Delete(string key) =>
        Authorized(new HttpRequestMessage(HttpMethod.Delete, $"/api/objects/{key}"));

    public HttpRequestMessage Authorized(HttpRequestMessage request)
    {
        request.Headers.Add("X-Api-Key", ApiKey);
        return request;
    }

    public async Task<byte[]> PutAsync(string key, byte[] bytes, string? provider = null)
    {
        using var response = await Client.SendAsync(Put(key, bytes, provider: provider));
        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<UploadResponse>(JsonOptions.Web);
        body.ShouldNotBeNull();
        return bytes;
    }

    public sealed record UploadResponse(string Url, string Key, string Provider, long? SizeBytes, string? ContentType, DateTimeOffset ExpiresAt);

    public static class JsonOptions
    {
        public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    }
}
