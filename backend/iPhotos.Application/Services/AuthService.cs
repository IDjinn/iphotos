using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

public sealed class AuthService(
    IUserRepository users,
    IRefreshTokenRepository refreshTokens,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    StorageOptions storageOptions)
{
    public async Task<AuthResult> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Password.Length < 8)
        {
            throw new ValidationException("Password must be at least 8 characters long.");
        }

        User user;
        try
        {
            user = User.Create(
                request.Email,
                passwordHasher.Hash(request.Password),
                request.DisplayName,
                storageOptions.DefaultQuotaBytes,
                dateTime.UtcNow);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        if (await users.GetByEmailAsync(user.Email, cancellationToken) is not null)
        {
            throw new EmailAlreadyExistsException(user.Email);
        }

        await users.AddAsync(user, cancellationToken);
        var tokens = await IssueTokensAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new AuthResult(user.Id, user.Email, user.DisplayName, tokens);
    }

    public async Task<AuthTokens> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var user = await users.GetByEmailAsync(NormalizeEmail(request.Email), cancellationToken)
            ?? throw new UnauthorizedException();

        if (!passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException();
        }

        var tokens = await IssueTokensAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return tokens;
    }

    public async Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        var stored = await FindActiveTokenAsync(refreshToken, cancellationToken);
        var user = await users.GetByIdAsync(stored.UserId, cancellationToken)
            ?? throw new UnauthorizedException("Invalid refresh token.");

        stored.Revoke(dateTime.UtcNow);
        var tokens = await IssueTokensAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return tokens;
    }

    public async Task LogoutAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        var stored = await refreshTokens.FindByHashAsync(tokenService.HashRefreshToken(refreshToken), cancellationToken);
        if (stored is not null && stored.IsActive(dateTime.UtcNow))
        {
            stored.Revoke(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<RefreshToken> FindActiveTokenAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var stored = await refreshTokens.FindByHashAsync(tokenService.HashRefreshToken(refreshToken), cancellationToken)
            ?? throw new UnauthorizedException("Invalid refresh token.");

        if (!stored.IsActive(dateTime.UtcNow))
        {
            throw new UnauthorizedException("Invalid refresh token.");
        }

        return stored;
    }

    private async Task<AuthTokens> IssueTokensAsync(User user, CancellationToken cancellationToken)
    {
        var accessToken = tokenService.IssueAccessToken(user.Id, user.Email);
        var refresh = tokenService.GenerateRefreshToken();
        await refreshTokens.AddAsync(
            RefreshToken.Create(user.Id, refresh.TokenHash, refresh.ExpiresAt, dateTime.UtcNow),
            cancellationToken);
        return new AuthTokens(accessToken, refresh.PlainToken, refresh.ExpiresAt);
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
