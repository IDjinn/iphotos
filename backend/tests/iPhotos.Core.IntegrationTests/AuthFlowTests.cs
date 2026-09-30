using System.Net;
using System.Net.Http.Json;
using iPhotos.Application;
using Xunit;

namespace iPhotos.Core.IntegrationTests;

public sealed class AuthFlowTests : IClassFixture<iPhotosApiFactory>
{
    private readonly iPhotosApiFactory _factory;

    public AuthFlowTests(iPhotosApiFactory factory) => _factory = factory;

    private HttpClient Client => _factory.CreateClient();

    private static StringContent Json(object value) =>
        new(System.Text.Json.JsonSerializer.Serialize(value, JsonOptions.Web), null, "application/json");

    [Fact]
    public async Task Register_Login_Refresh_Logout_FullCycle()
    {
        var register = await Client.PostAsync("/api/auth/register", Json(new
        {
            email = "lucas@example.com",
            password = "password123",
            displayName = "Lucas",
        }));
        register.StatusCode.ShouldBe(HttpStatusCode.Created);
        var auth = await register.Content.ReadFromJsonAsync<AuthResult>(JsonOptions.Web);
        auth.ShouldNotBeNull();
        auth.Tokens.AccessToken.ShouldNotBeNullOrWhiteSpace();
        auth.Email.ShouldBe("lucas@example.com");

        // Protected endpoint works with the fresh access token.
        using var authorized = _factory.CreateClient();
        authorized.DefaultRequestHeaders.Authorization = new("Bearer", auth!.Tokens.AccessToken);
        (await authorized.GetAsync("/api/usage")).StatusCode.ShouldBe(HttpStatusCode.OK);

        // Refresh rotates the token.
        var refresh = await Client.PostAsync("/api/auth/refresh", Json(new { refreshToken = auth.Tokens.RefreshToken }));
        refresh.StatusCode.ShouldBe(HttpStatusCode.OK);
        var rotated = await refresh.Content.ReadFromJsonAsync<AuthTokens>(JsonOptions.Web);
        rotated.ShouldNotBeNull();
        rotated!.RefreshToken.ShouldNotBe(auth.Tokens.RefreshToken);

        // Reusing the old refresh token is rejected.
        var reuse = await Client.PostAsync("/api/auth/refresh", Json(new { refreshToken = auth.Tokens.RefreshToken }));
        reuse.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        // Logout revokes the current refresh token.
        using var authed = _factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new("Bearer", rotated.AccessToken);
        var logout = await authed.PostAsync("/api/auth/logout", Json(new { refreshToken = rotated.RefreshToken }));
        logout.StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var afterLogout = await Client.PostAsync("/api/auth/refresh", Json(new { refreshToken = rotated.RefreshToken }));
        afterLogout.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var payload = Json(new { email = "dup@example.com", password = "password123" });
        (await Client.PostAsync("/api/auth/register", payload)).StatusCode.ShouldBe(HttpStatusCode.Created);
        // IFormFile-free replay: serialize again since the first content was consumed.
        var replay = await Client.PostAsync("/api/auth/register", Json(new { email = "dup@example.com", password = "other-pass-123" }));
        replay.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Register_ShortPassword_Returns400()
    {
        var response = await Client.PostAsync("/api/auth/register", Json(new { email = "x@example.com", password = "short" }));
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Login_WrongPassword_Returns401()
    {
        await Client.PostAsync("/api/auth/register", Json(new { email = "wrongpw@example.com", password = "password123" }));

        var login = await Client.PostAsync("/api/auth/login", Json(new { email = "wrongpw@example.com", password = "not-the-password" }));

        login.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_UnknownEmail_Returns401()
    {
        var login = await Client.PostAsync("/api/auth/login", Json(new { email = "ghost@example.com", password = "password123" }));

        login.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Photos_WithoutToken_Returns401()
    {
        (await Client.GetAsync("/api/photos")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Client.GetAsync("/api/usage")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }
}
