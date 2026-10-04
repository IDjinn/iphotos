using iPhotos.Application.Common;
using iPhotos.Infrastructure;
using iPhotos.Infrastructure.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace iPhotos.Infrastructure.UnitTests;

/// <summary>
/// The keyed "staging" blob storage isolates zip-import archives from the main blob
/// target: with StorageService:StagingProvider set (Http mode) it addresses a
/// different storage-service provider; otherwise it aliases the main backend.
/// </summary>
public class BlobStorageRegistrationTests
{
    private const string HttpConfig = "BlobStorage:Mode";

    private static ServiceProvider BuildProvider(Dictionary<string, string?> config)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(config).Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddInfrastructure();
        return services.BuildServiceProvider();
    }

    private static Dictionary<string, string?> HttpStorageConfig(Dictionary<string, string?> extra)
    {
        var config = new Dictionary<string, string?>
        {
            [HttpConfig] = "Http",
            ["StorageService:BaseUrl"] = "http://storage.invalid",
            ["StorageService:ApiKey"] = "test-key",
            ["StorageService:AllowPrivateNetworks"] = "true",
        };
        foreach (var (key, value) in extra)
        {
            config[key] = value;
        }

        return config;
    }

    [Fact]
    public void StagingProvider_Configured_ResolvesSeparateHttpBlobStorage()
    {
        using var provider = BuildProvider(HttpStorageConfig(new Dictionary<string, string?>
        {
            ["StorageService:StagingProvider"] = "filesystem",
        }));

        var main = provider.GetRequiredService<IBlobStorage>();
        var staging = provider.GetRequiredKeyedService<IBlobStorage>("staging");

        staging.ShouldNotBeSameAs(main);
        staging.ShouldBeOfType<HttpBlobStorage>();
    }

    [Fact]
    public void StagingProvider_Unset_AliasesTheMainBackend()
    {
        using var provider = BuildProvider(HttpStorageConfig(new Dictionary<string, string?>()));

        var main = provider.GetRequiredService<IBlobStorage>();
        var staging = provider.GetRequiredKeyedService<IBlobStorage>("staging");

        staging.ShouldBeSameAs(main);
    }

    [Fact]
    public void FilesystemMode_AliasesTheMainBackend_EvenWithStagingProviderSet()
    {
        using var provider = BuildProvider(new Dictionary<string, string?>
        {
            ["StorageService:BaseUrl"] = "http://storage.invalid",
            ["StorageService:StagingProvider"] = "filesystem",
        });

        var main = provider.GetRequiredService<IBlobStorage>();
        var staging = provider.GetRequiredKeyedService<IBlobStorage>("staging");

        main.ShouldBeOfType<FilesystemBlobStorage>();
        staging.ShouldBeSameAs(main);
    }
}
