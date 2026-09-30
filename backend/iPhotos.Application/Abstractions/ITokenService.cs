namespace iPhotos.Application.Abstractions;

public sealed record RefreshTokenIssue(string PlainToken, string TokenHash, DateTimeOffset ExpiresAt);

public interface ITokenService
{
    string IssueAccessToken(Guid userId, string email);

    /// <summary>Validates signature, issuer, audience and lifetime. Throws if invalid.</summary>
    /// <returns>The user id from the "sub" claim.</returns>
    Task<Guid> ValidateAccessTokenAsync(string accessToken, CancellationToken cancellationToken = default);

    RefreshTokenIssue GenerateRefreshToken();

    string HashRefreshToken(string plainToken);
}
