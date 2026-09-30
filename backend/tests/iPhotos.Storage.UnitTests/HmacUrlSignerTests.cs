using iPhotos.Storage;

namespace iPhotos.Storage.UnitTests;

public class HmacUrlSignerTests
{
    private readonly HmacUrlSigner _signer = new("test-signing-key-32-bytes-minimum!");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-30T12:00:00Z");

    [Fact]
    public void Sign_SameInputs_ProducesStableSignature()
    {
        var first = _signer.Sign("GET", "filesystem", "a/b.jpg", Now);
        var second = _signer.Sign("GET", "filesystem", "a/b.jpg", Now);

        first.ShouldBe(second);
        first.ShouldNotContain('+');
        first.ShouldNotContain('/');
        first.ShouldNotContain('=');
    }

    [Fact]
    public void TryValidate_UntamperedUrl_ReturnsTrue()
    {
        var expires = Now.AddHours(1).ToUnixTimeSeconds();
        var signature = _signer.Sign("GET", "s3", "owner/photo/original.jpg", Now.AddHours(1));

        var valid = _signer.TryValidate("GET", "s3", "owner/photo/original.jpg", expires, signature, Now);

        valid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("POST", "s3", "owner/photo/original.jpg")]
    [InlineData("GET", "filesystem", "owner/photo/original.jpg")]
    [InlineData("GET", "s3", "owner/photo/other.jpg")]
    public void TryValidate_TamperedScope_ReturnsFalse(string method, string providerId, string key)
    {
        var expires = Now.AddHours(1).ToUnixTimeSeconds();
        var signature = _signer.Sign("GET", "s3", "owner/photo/original.jpg", Now.AddHours(1));

        var valid = _signer.TryValidate(method, providerId, key, expires, signature, Now);

        valid.ShouldBeFalse();
    }

    [Fact]
    public void TryValidate_Expired_ReturnsFalse()
    {
        var expires = Now.AddHours(1).ToUnixTimeSeconds();
        var signature = _signer.Sign("GET", "s3", "a.jpg", Now.AddHours(1));

        var valid = _signer.TryValidate("GET", "s3", "a.jpg", expires, signature, Now.AddHours(2));

        valid.ShouldBeFalse();
    }

    [Fact]
    public void TryValidate_DifferentKey_ReturnsFalse()
    {
        var expires = Now.AddHours(1).ToUnixTimeSeconds();
        var signature = _signer.Sign("GET", "s3", "a.jpg", Now.AddHours(1));
        var otherSigner = new HmacUrlSigner("another-signing-key-32-bytes-min!");

        var valid = otherSigner.TryValidate("GET", "s3", "a.jpg", expires, signature, Now);

        valid.ShouldBeFalse();
    }

    [Fact]
    public void TryValidate_MissingSignature_ReturnsFalse()
    {
        var expires = Now.AddHours(1).ToUnixTimeSeconds();

        _signer.TryValidate("GET", "s3", "a.jpg", expires, null, Now).ShouldBeFalse();
        _signer.TryValidate("GET", "s3", "a.jpg", expires, string.Empty, Now).ShouldBeFalse();
    }
}
