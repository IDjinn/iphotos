using iPhotos.Storage;

namespace iPhotos.Storage.UnitTests;

public class SignedObjectUrlTests
{
    [Fact]
    public void Create_ContainsKeyProviderExpiryAndSignature()
    {
        var signer = new HmacUrlSigner("signing-key");
        var expiresAt = DateTimeOffset.Parse("2026-10-07T00:00:00Z");

        var url = SignedObjectUrl.Create("https://storage.example.com", "filesystem", "owner 1/photo/original.jpg", expiresAt, signer);

        url.ShouldStartWith("https://storage.example.com/api/objects/owner%201/photo/original.jpg");
        url.ShouldContain("provider=filesystem");
        url.ShouldContain($"exp={expiresAt.ToUnixTimeSeconds()}");
        url.ShouldContain("sig=");
    }

    [Fact]
    public void Create_TrimsTrailingSlashOfBaseUrl()
    {
        var signer = new HmacUrlSigner("signing-key");

        var url = SignedObjectUrl.Create("https://host.example/", "filesystem", "a.jpg", DateTimeOffset.UtcNow, signer);

        url.ShouldContain("https://host.example/api/objects/a.jpg");
    }
}
