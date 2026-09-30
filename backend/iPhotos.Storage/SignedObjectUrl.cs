namespace iPhotos.Storage;

/// <summary>
/// Builds absolute, time-limited GET URLs for objects served by this host. Used for
/// providers that cannot presign (filesystem, WebDAV, Google Drive); the signature is a
/// capability — possession of the URL grants read access until it expires.
/// </summary>
public static class SignedObjectUrl
{
    public static string Create(
        string baseUrl,
        string providerId,
        string key,
        DateTimeOffset expiresAt,
        HmacUrlSigner signer)
    {
        var exp = expiresAt.ToUnixTimeSeconds();
        var signature = signer.Sign("GET", providerId, key, expiresAt);
        var escaped = ObjectKey.EscapePath(key);
        return $"{baseUrl.TrimEnd('/')}/api/objects/{escaped}"
            + $"?provider={Uri.EscapeDataString(providerId)}&exp={exp}&sig={signature}";
    }
}
