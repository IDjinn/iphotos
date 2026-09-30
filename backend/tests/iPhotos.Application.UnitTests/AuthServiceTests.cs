using iPhotos.Application;
using iPhotos.Application.Common;
using iPhotos.Application.Services;

namespace iPhotos.Application.UnitTests;

public class AuthServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryRefreshTokenRepository _refreshTokens = new();
    private readonly FakePasswordHasher _hasher = new();
    private readonly FakeTokenService _tokens = new();
    private readonly FakeUnitOfWork _uow = new();

    private AuthService NewService(long quota = 1_000_000) => new(
        _users,
        _refreshTokens,
        _hasher,
        _tokens,
        _uow,
        new StubDateTimeProvider(Now),
        new StorageOptions { DefaultQuotaBytes = quota });

    private async Task<AuthResult> RegisterAsync(string email = "lucas@example.com", string password = "password123") =>
        await NewService().RegisterAsync(new RegisterRequest(email, password, "Lucas"));

    [Fact]
    public async Task Register_CreatesUserNormalizedAndReturnsTokens()
    {
        var result = await RegisterAsync("Lucas@Example.COM");

        result.UserId.ShouldNotBe(Guid.Empty);
        result.Email.ShouldBe("lucas@example.com");
        result.DisplayName.ShouldBe("Lucas");
        result.Tokens.AccessToken.ShouldStartWith("access:");
        result.Tokens.RefreshToken.ShouldNotBeNullOrWhiteSpace();

        var user = _users.Users.Single();
        user.Id.ShouldBe(result.UserId);
        user.StorageQuotaBytes.ShouldBe(1_000_000);
        user.PasswordHash.ShouldBe("fake$password123");
        _refreshTokens.Tokens.ShouldHaveSingleItem();
        _uow.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Throws()
    {
        await RegisterAsync();

        await Should.ThrowAsync<EmailAlreadyExistsException>(
            () => RegisterAsync("other-name@example.com".Replace("other-name", "lucas")));
    }

    [Fact]
    public async Task Register_ShortPassword_Throws()
    {
        await Should.ThrowAsync<ValidationException>(() => RegisterAsync(password: "short1"));
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    public async Task Register_InvalidEmail_Throws(string email)
    {
        await Should.ThrowAsync<ValidationException>(() => RegisterAsync(email: email));
    }

    [Fact]
    public async Task Login_UnknownEmail_ThrowsUnauthorized()
    {
        await RegisterAsync();

        await Should.ThrowAsync<UnauthorizedException>(
            () => NewService().LoginAsync(new LoginRequest("ghost@example.com", "password123")));
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorized()
    {
        await RegisterAsync();

        await Should.ThrowAsync<UnauthorizedException>(
            () => NewService().LoginAsync(new LoginRequest("lucas@example.com", "wrong-password")));
    }

    [Fact]
    public async Task Login_Success_ReturnsTokens()
    {
        await RegisterAsync();

        var tokens = await NewService().LoginAsync(new LoginRequest("LUCAS@example.com", "password123"));

        tokens.AccessToken.ShouldBe($"access:{_users.Users.Single().Id}");
        _refreshTokens.Tokens.Count.ShouldBe(2); // register + login
    }

    [Fact]
    public async Task Refresh_ValidToken_RotatesIt()
    {
        var registered = await RegisterAsync();

        var tokens = await NewService().RefreshAsync(registered.Tokens.RefreshToken);

        var oldToken = _refreshTokens.Tokens.First(t => t.TokenHash == _tokens.HashRefreshToken(registered.Tokens.RefreshToken));
        oldToken.RevokedAt.ShouldBe(Now);
        tokens.RefreshToken.ShouldNotBe(registered.Tokens.RefreshToken);
        tokens.AccessToken.ShouldStartWith("access:");
    }

    [Fact]
    public async Task Refresh_ReusedRevokedToken_Throws()
    {
        var registered = await RegisterAsync();
        await NewService().RefreshAsync(registered.Tokens.RefreshToken);

        await Should.ThrowAsync<UnauthorizedException>(
            () => NewService().RefreshAsync(registered.Tokens.RefreshToken));
    }

    [Fact]
    public async Task Refresh_UnknownToken_Throws()
    {
        await RegisterAsync();

        await Should.ThrowAsync<UnauthorizedException>(() => NewService().RefreshAsync("never-issued"));
    }

    [Fact]
    public async Task Refresh_ExpiredToken_Throws()
    {
        _tokens.RefreshExpiry = Now.AddDays(-1);
        var registered = await RegisterAsync();

        await Should.ThrowAsync<UnauthorizedException>(
            () => NewService().RefreshAsync(registered.Tokens.RefreshToken));
    }

    [Fact]
    public async Task Logout_RevokesActiveToken()
    {
        var registered = await RegisterAsync();

        await NewService().LogoutAsync(registered.Tokens.RefreshToken);

        _refreshTokens.Tokens.Single().RevokedAt.ShouldBe(Now);
    }

    [Fact]
    public async Task Logout_UnknownToken_IsNoOp()
    {
        await RegisterAsync();

        await NewService().LogoutAsync("never-issued");

        _refreshTokens.Tokens.Single().RevokedAt.ShouldBeNull();
        _uow.SaveCount.ShouldBe(1);
    }
}
