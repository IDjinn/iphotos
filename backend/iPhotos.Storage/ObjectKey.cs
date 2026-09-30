using System.Buffers;

namespace iPhotos.Storage;

/// <summary>The caller-supplied object key is malformed.</summary>
public sealed class InvalidObjectKeyException(string message) : Exception(message);

/// <summary>
/// Object keys are opaque, caller-chosen, '/'-separated paths relative to the provider
/// root (e.g. "{owner}/{photo}/original.jpg"). They are normalized and validated once
/// here so every provider can map them onto its own physical layout safely.
/// </summary>
public static class ObjectKey
{
    public const int MaxLength = 1024;

    private static readonly SearchValues<char> Allowed =
        SearchValues.Create("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-/");

    /// <summary>Normalizes separators and validates the key, returning the canonical form.</summary>
    public static string Normalize(string key)
    {
        var normalized = key.Replace('\\', '/');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidObjectKeyException("Object key must not be empty.");
        }

        if (normalized.Length > MaxLength)
        {
            throw new InvalidObjectKeyException($"Object key exceeds {MaxLength} characters.");
        }

        if (normalized.StartsWith('/'))
        {
            throw new InvalidObjectKeyException("Object key must be relative to the storage root.");
        }

        foreach (var segment in normalized.Split('/'))
        {
            if (segment.Length == 0)
            {
                throw new InvalidObjectKeyException("Object key must not contain empty segments ('//').");
            }

            if (segment is "." or "..")
            {
                throw new InvalidObjectKeyException($"Object key segment '{segment}' is not allowed.");
            }

            if (segment.AsSpan().ContainsAnyExcept(Allowed))
            {
                throw new InvalidObjectKeyException(
                    $"Object key segment '{segment}' contains characters outside [A-Za-z0-9._-].");
            }
        }

        return normalized;
    }

    /// <summary>Escapes each segment for URL building while preserving '/' separators.</summary>
    public static string EscapePath(string key) =>
        string.Join('/', key.Split('/').Select(Uri.EscapeDataString));
}
