using iPhotos.Storage;
using iPhotos.Storage.Providers;

namespace iPhotos.Storage.UnitTests;

public class ObjectStoreFactoryTests
{
    private static StorageServiceOptions Options => new() { DefaultProvider = "filesystem" };

    [Fact]
    public void Resolve_ConfiguredFileSystem_ReturnsStore()
    {
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), null, null, null);

        var store = factory.GetDefault();

        store.Id.ShouldBe("filesystem");
        store.CanPresign.ShouldBeFalse();
    }

    [Fact]
    public void Resolve_UnconfiguredS3_Throws()
    {
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), new S3ProviderOptions(), null, null);

        Should.Throw<ProviderNotConfiguredException>(() => factory.Resolve("s3"));
    }

    [Fact]
    public void Resolve_UnknownProvider_Throws()
    {
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), null, null, null);

        Should.Throw<ProviderNotConfiguredException>(() => factory.Resolve("dropbox"));
    }

    [Fact]
    public void Resolve_UnknownProviderFallsBackToConfiguredDefault_WhenQueryEmpty()
    {
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), null, null, null);

        factory.Resolve(null).Id.ShouldBe("filesystem");
        factory.Resolve("  ").Id.ShouldBe("filesystem");
    }

    [Fact]
    public void Resolve_SameId_ReturnsCachedInstance()
    {
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), null, null, null);

        var first = factory.Resolve("filesystem");
        var second = factory.Resolve("filesystem");

        first.ShouldBeSameAs(second);
    }

    [Fact]
    public void Resolve_S3PartiallyConfigured_Throws()
    {
        var s3 = new S3ProviderOptions() { Bucket = "b", AccessKey = "k" }; // secret missing
        var factory = ObjectStoreFactory.FromOptions(Options, new FileSystemProviderOptions(), s3, null, null);

        Should.Throw<ProviderNotConfiguredException>(() => factory.Resolve("s3"));
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("prefix", "prefix/")]
    [InlineData("/wrapped/prefix/", "wrapped/prefix/")]
    [InlineData("a/b", "a/b/")]
    public void S3Prefix_NormalizedWithTrailingSlash(string input, string expected)
    {
        S3ObjectStore.NormalizePrefix(input).ShouldBe(expected);
    }

    [Fact]
    public void S3Prefix_Traversal_Throws()
    {
        Should.Throw<InvalidObjectKeyException>(() => S3ObjectStore.NormalizePrefix("../escape"));
    }
}
