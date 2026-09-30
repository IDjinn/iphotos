using System.Text.RegularExpressions;

namespace iPhotos.Domain;

public sealed partial class User
{
    private static readonly Regex EmailRegex = GenerateEmailRegex();

    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Opaque E2E fields (plan 03) — kept for a future zero-knowledge backup mode.</summary>
    public byte[]? WrappedMasterKey { get; set; }
    public byte[]? KdfSalt { get; set; }
    public string? KdfParams { get; set; }

    public string Plan { get; set; } = "free";
    public long StorageQuotaBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static User Create(string email, string passwordHash, string? displayName, long storageQuotaBytes, DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        var normalized = email.Trim().ToLowerInvariant();
        if (!EmailRegex.IsMatch(normalized))
        {
            throw new ArgumentException("Invalid e-mail address.", nameof(email));
        }

        return new User
        {
            Id = Guid.NewGuid(),
            Email = normalized,
            DisplayName = displayName,
            PasswordHash = passwordHash,
            Plan = "free",
            StorageQuotaBytes = storageQuotaBytes,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex GenerateEmailRegex();
}
