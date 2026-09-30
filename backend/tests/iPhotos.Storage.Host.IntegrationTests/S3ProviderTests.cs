using Amazon.S3;
using Amazon.S3.Model;
using DotNet.Testcontainers;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using iPhotos.Storage.Providers;

namespace iPhotos.Storage.Host.IntegrationTests;

/// <summary>
/// The S3 provider is exercised against a real S3-compatible server container — the same
/// code path a Wasabi/B2/R2/AWS deployment takes (endpoint + path-style). SeaweedFS is
/// used because MinIO images are unreachable from some environments; the provider code
/// under test is backend-agnostic.
/// </summary>
public sealed class SeaweedFixture : IAsyncLifetime
{
    // Dummy credentials: the test server has no auth configured; the SDK requires some.
    public static string AccessKey { get; } = $"test{Guid.NewGuid():N}"[..12];

    public static string SecretKey { get; } = $"secret-{Guid.NewGuid():N}";

    private readonly IContainer _container = new ContainerBuilder()
        .WithImage("chrislusf/seaweedfs:latest")
        .WithCommand("server", "-dir=/data", "-ip=0.0.0.0", "-s3", "-s3.port=8333", "-master.volumeSizeLimitMB=1024")
        .WithPortBinding(8333, assignRandomHostPort: true)
        .WithPortBinding(9333, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer()
            .UntilHttpRequestIsSucceeded(request => request.ForPort(9333).ForPath("/cluster/status"))
            .UntilHttpRequestIsSucceeded(request => request.ForPort(8333).ForPath("/")))
        .Build();

    public S3ProviderOptions Options { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        Options = new S3ProviderOptions
        {
            Endpoint = $"http://{_container.Hostname}:{_container.GetMappedPublicPort(8333)}",
            Region = "us-east-1",
            Bucket = "iphotos-test",
            AccessKey = AccessKey,
            SecretKey = SecretKey,
            ForcePathStyle = true,
        };

        using var bootstrap = new AmazonS3Client(AccessKey, SecretKey, new AmazonS3Config
        {
            ServiceURL = Options.Endpoint,
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-1",
        });

        // SeaweedFS answers readiness checks slightly before the S3 layer is fully wired.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await bootstrap.PutBucketAsync(new PutBucketRequest { BucketName = "iphotos-test" });
                break;
            }
            catch (Exception) when (attempt < 10)
            {
                await Task.Delay(500);
            }
        }
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

public class S3ProviderTests(SeaweedFixture minio) : IClassFixture<SeaweedFixture>
{
    private S3ObjectStore Store => new(minio.Options, allowPrivateNetworks: true);

    [Fact]
    public async Task Put_OpenReadDelete_RoundTripsViaMinio()
    {
        var store = Store;
        var bytes = "s3-roundtrip"u8.ToArray();

        ObjectWriteResult written;
        using (var content = new MemoryStream(bytes))
        {
            written = await store.PutAsync("owner/p2/original.jpg", content, "image/jpeg");
        }

        written.SizeBytes.ShouldBe(bytes.Length);

        var read = await store.OpenReadAsync("owner/p2/original.jpg");
        using (read.Content)
        using (var buffer = new MemoryStream())
        {
            await read.Content.CopyToAsync(buffer);
            buffer.ToArray().ShouldBe(bytes);
        }

        (await store.HeadAsync("owner/p2/original.jpg")).SizeBytes.ShouldBe(bytes.Length);

        await store.DeleteAsync("owner/p2/original.jpg");
        (await Record.ExceptionAsync(() => store.OpenReadAsync("owner/p2/original.jpg")))
            .ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task TryPresign_YieldsWorkingUrlWithoutCredentials()
    {
        var store = Store;
        using (var content = new MemoryStream([1, 2, 3]))
        {
            await store.PutAsync("presign.bin", content, null);
        }

        var url = await store.TryPresignGetAsync("presign.bin", TimeSpan.FromMinutes(5));

        url.ShouldNotBeNull();
        using var http = new HttpClient();
        var response = await http.GetAsync(url);
        response.StatusCode.ShouldBe(System.Net.HttpStatusCode.OK);
        (await response.Content.ReadAsByteArrayAsync()).ShouldBe([1, 2, 3]);
    }

    [Fact]
    public async Task OpenRead_Missing_ThrowsObjectNotFound()
    {
        var exception = await Record.ExceptionAsync(() => Store.OpenReadAsync("never.bin"));

        exception.ShouldBeOfType<ObjectNotFoundException>();
    }

    [Fact]
    public async Task Prefix_IsAppliedToPhysicalKeys()
    {
        var options = minio.Options;
        options.Prefix = "tenant-a";
        var store = new S3ObjectStore(options, allowPrivateNetworks: true);
        using (var content = new MemoryStream([5]))
        {
            await store.PutAsync("x.bin", content, null);
        }

        using var probe = new AmazonS3Client(options.AccessKey, options.SecretKey, new AmazonS3Config
        {
            ServiceURL = options.Endpoint,
            ForcePathStyle = true,
            AuthenticationRegion = options.Region,
        });
        var listing = await probe.ListObjectsV2Async(new ListObjectsV2Request { BucketName = options.Bucket, Prefix = "tenant-a/" });

        listing.S3Objects.ShouldContain(o => o.Key == "tenant-a/x.bin");
    }
}
