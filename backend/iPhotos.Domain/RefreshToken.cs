namespace iPhotos.Domain;

public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public static RefreshToken Create(Guid userId, string tokenHash, DateTimeOffset expiresAt, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        TokenHash = tokenHash,
        ExpiresAt = expiresAt,
        CreatedAt = now,
    };

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;

    public void Revoke(DateTimeOffset now)
    {
        if (RevokedAt is not null)
        {
            throw new InvalidOperationException("Refresh token is already revoked.");
        }

        RevokedAt = now;
    }
}
