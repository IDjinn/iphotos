using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Auth;

namespace iPhotos.Auth.UnitTests;

public class JwtTokenServiceTests
{
    private static readonly DateTimeOffset FixedNow = DateTimeOffset.UtcNow;

    private static JwtOptions Options(TimeSpan? accessLifetime = null) => new()
    {
        SigningKey = "test-signing-key-at-least-32-characters!!",
        Issuer = "iphotos-test",
        Audience = "iphotos-client-test",
        AccessTokenLifetime = accessLifetime ?? TimeSpan.FromMinutes(15),
        RefreshTokenLifetime = TimeSpan.FromDays(30),
    };

    private static JwtTokenService NewService(JwtOptions? options = null) =>
        new(options ?? Options(), new FixedTimeProvider(FixedNow));

    [Fact]
    public async Task IssueAccessToken_ThenValidate_ReturnsUserId()
    {
        var service = NewService();
        var userId = Guid.NewGuid();
        var token = service.IssueAccessToken(userId, "user@example.com");

        (await service.ValidateAccessTokenAsync(token)).ShouldBe(userId);
    }

    [Fact]
    public async Task ValidateAccessToken_WithDifferentSigningKey_Throws()
    {
        var issuer = NewService();
        var token = issuer.IssueAccessToken(Guid.NewGuid(), "user@example.com");

        var otherOptions = Options();
        otherOptions.SigningKey = "another-signing-key-at-least-32-characters!!";
        var validator = NewService(otherOptions);

        await Should.ThrowAsync<Exception>(() => validator.ValidateAccessTokenAsync(token));
    }

    [Fact]
    public async Task ValidateAccessToken_ExpiredToken_Throws()
    {
        var service = NewService(Options(accessLifetime: TimeSpan.FromSeconds(-30)));
        var token = service.IssueAccessToken(Guid.NewGuid(), "user@example.com");

        await Should.ThrowAsync<Exception>(() => service.ValidateAccessTokenAsync(token));
    }

    [Fact]
    public async Task ValidateAccessToken_GarbageToken_Throws()
    {
        var service = NewService();

        await Should.ThrowAsync<Exception>(() => service.ValidateAccessTokenAsync("garbage.token.value"));
    }

    [Fact]
    public void GenerateRefreshToken_IsUniqueAndHashable()
    {
        var service = NewService();
        var a = service.GenerateRefreshToken();
        var b = service.GenerateRefreshToken();

        a.PlainToken.ShouldNotBe(b.PlainToken);
        a.ExpiresAt.ShouldBe(FixedNow.AddDays(30));
        a.TokenHash.ShouldBe(service.HashRefreshToken(a.PlainToken));
        a.TokenHash.ShouldNotBe(b.TokenHash);
    }

    [Fact]
    public void HashRefreshToken_IsStableSha256Hex()
    {
        var service = NewService();

        var hash = service.HashRefreshToken("abc");

        hash.ShouldBe(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("abc"))).ToLowerInvariant());
        hash.Length.ShouldBe(64);
    }

    [Fact]
    public void Constructor_ShortSigningKey_Throws()
    {
        var options = Options();
        options.SigningKey = "too-short";

        Should.Throw<ArgumentException>(() => NewService(options));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : iPhotos.Application.Common.IDateTimeProvider
    {
        public DateTimeOffset UtcNow => now;
    }
}
