using iPhotos.Auth;

namespace iPhotos.Auth.UnitTests;

public class Argon2PasswordHasherTests
{
    private static Argon2PasswordHasher NewHasher() =>
        new(new Argon2HasherOptions { TimeCost = 1, MemoryCost = 1024, Lanes = 2 });

    [Fact]
    public void Hash_ReturnsPhcFormattedString()
    {
        var hasher = NewHasher();

        var hash = hasher.Hash("correct horse battery staple");

        hash.ShouldStartWith("$argon2id$v=19$m=1024,t=1,p=2$");
        hash.Split('$', StringSplitOptions.RemoveEmptyEntries).Length.ShouldBe(5);
    }

    [Fact]
    public void Verify_SamePassword_ReturnsTrue()
    {
        var hasher = NewHasher();
        var hash = hasher.Hash("s3cret-Password");

        hasher.Verify("s3cret-Password", hash).ShouldBeTrue();
    }

    [Theory]
    [InlineData("wrong")]
    [InlineData("")]
    [InlineData("S3cret-Password")] // case difference
    public void Verify_DifferentPassword_ReturnsFalse(string candidate)
    {
        var hasher = NewHasher();
        var hash = hasher.Hash("s3cret-Password");

        hasher.Verify(candidate, hash).ShouldBeFalse();
    }

    [Fact]
    public void Hash_UsesRandomSalt_ProducesDistinctHashes()
    {
        var hasher = NewHasher();

        var hash1 = hasher.Hash("same-password");
        var hash2 = hasher.Hash("same-password");

        hash1.ShouldNotBe(hash2);
        hasher.Verify("same-password", hash1).ShouldBeTrue();
        hasher.Verify("same-password", hash2).ShouldBeTrue();
    }

    [Fact]
    public void Verify_TamperedHash_ReturnsFalse()
    {
        var hasher = NewHasher();
        var hash = hasher.Hash("password");
        var parts = hash.Split('$');
        // Flip a character inside the digest segment
        var digest = parts[^1];
        var tampered = digest[0] == 'a' ? 'b' : 'a';
        parts[^1] = tampered + digest[1..];

        hasher.Verify("password", string.Join('$', parts)).ShouldBeFalse();
    }

    [Fact]
    public void Verify_GarbageHash_ReturnsFalse()
    {
        var hasher = NewHasher();

        hasher.Verify("password", "not-a-phc-hash").ShouldBeFalse();
    }
}
