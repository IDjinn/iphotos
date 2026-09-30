using iPhotos.Domain;

namespace iPhotos.Domain.UnitTests;

public class RefreshTokenTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_StoresHashAndExpiry()
    {
        var token = RefreshToken.Create(Guid.NewGuid(), "hash-of-token", Now.AddDays(30), Now);

        token.Id.ShouldNotBe(Guid.Empty);
        token.TokenHash.ShouldBe("hash-of-token");
        token.ExpiresAt.ShouldBe(Now.AddDays(30));
        token.RevokedAt.ShouldBeNull();
        token.IsActive(Now).ShouldBeTrue();
    }

    [Fact]
    public void IsActive_False_WhenExpired()
    {
        var token = RefreshToken.Create(Guid.NewGuid(), "hash", Now.AddDays(-1), Now.AddDays(-31));

        token.IsActive(Now).ShouldBeFalse();
    }

    [Fact]
    public void IsActive_False_WhenRevoked()
    {
        var token = RefreshToken.Create(Guid.NewGuid(), "hash", Now.AddDays(30), Now);
        token.Revoke(Now);

        token.RevokedAt.ShouldBe(Now);
        token.IsActive(Now).ShouldBeFalse();
    }

    [Fact]
    public void Revoke_Twice_Throws()
    {
        var token = RefreshToken.Create(Guid.NewGuid(), "hash", Now.AddDays(30), Now);
        token.Revoke(Now);

        Should.Throw<InvalidOperationException>(() => token.Revoke(Now.AddMinutes(1)));
    }
}
