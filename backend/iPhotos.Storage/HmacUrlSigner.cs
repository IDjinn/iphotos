using System.Security.Cryptography;
using System.Text;

namespace iPhotos.Storage;

/// <summary>
/// Mints and validates HMAC-SHA256 capability tokens for GET URLs served by this host
/// (for providers that cannot presign themselves). Token scope: method|provider|key|expiry.
/// </summary>
public sealed class HmacUrlSigner(string signingKey)
{
    private readonly byte[] _key = Encoding.UTF8.GetBytes(signingKey);

    public string Sign(string method, string providerId, string key, DateTimeOffset expiresAt)
    {
        ArgumentException.ThrowIfNullOrEmpty(key);
        var payload = $"{method}|{providerId}|{key}|{expiresAt.ToUnixTimeSeconds()}";
        return ToBase64Url(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(payload)));
    }

    public bool TryValidate(
        string method,
        string providerId,
        string key,
        long expiresAtUnixSeconds,
        string? signature,
        DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(signature) || expiresAtUnixSeconds < now.ToUnixTimeSeconds())
        {
            return false;
        }

        var expected = Sign(method, providerId, key, DateTimeOffset.FromUnixTimeSeconds(expiresAtUnixSeconds));
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(expected),
            Encoding.ASCII.GetBytes(signature));
    }

    internal static string ToBase64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
