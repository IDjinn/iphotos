using System.Security.Cryptography;
using System.Text;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace iPhotos.Auth;

public sealed class JwtTokenService(JwtOptions options, IDateTimeProvider dateTimeProvider) : ITokenService
{
    private readonly JsonWebTokenHandler _handler = new();
    private readonly SymmetricSecurityKey _signingKey = CreateKey(options);

    public string IssueAccessToken(Guid userId, string email)
    {
        var now = dateTimeProvider.UtcNow.UtcDateTime;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = options.Issuer,
            Audience = options.Audience,
            NotBefore = now,
            Expires = now.Add(options.AccessTokenLifetime),
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = userId.ToString(),
                [JwtRegisteredClaimNames.Email] = email,
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString(),
            },
        };

        return _handler.CreateToken(descriptor);
    }

    public async Task<Guid> ValidateAccessTokenAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        var parameters = new TokenValidationParameters
        {
            ValidIssuer = options.Issuer,
            ValidAudience = options.Audience,
            IssuerSigningKey = _signingKey,
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };

        var result = await _handler.ValidateTokenAsync(accessToken, parameters);
        if (!result.IsValid)
        {
            throw new SecurityTokenException("Invalid access token.", result.Exception);
        }

        var sub = result.ClaimsIdentity.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return Guid.TryParse(sub, out var userId)
            ? userId
            : throw new SecurityTokenException("Access token has no valid 'sub' claim.");
    }

    public RefreshTokenIssue GenerateRefreshToken()
    {
        var plain = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var expiresAt = dateTimeProvider.UtcNow.Add(options.RefreshTokenLifetime);
        return new RefreshTokenIssue(plain, HashRefreshToken(plain), expiresAt);
    }

    public string HashRefreshToken(string plainToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plainToken))).ToLowerInvariant();

    private static SymmetricSecurityKey CreateKey(JwtOptions options)
    {
        if (Encoding.UTF8.GetByteCount(options.SigningKey) < 32)
        {
            throw new ArgumentException(
                $"{nameof(JwtOptions)}.{nameof(JwtOptions.SigningKey)} must be at least 32 bytes (256 bits).",
                nameof(options));
        }

        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey));
    }
}
