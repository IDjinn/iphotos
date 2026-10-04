using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace iPhotos.Application.Services;

/// <summary>
/// Google Takeout metadata for zip import entries. Takeout strips EXIF from some
/// media, so the sidecar JSON files (<c>&lt;media&gt;.json</c> legacy layout,
/// <c>&lt;media&gt;.supplemental-metadata.json</c> current layout) and the
/// <c>YYYY-MM-DD</c> date folders are the only reliable metadata source.
/// </summary>
public static class TakeoutMetadata
{
    private const string SupplementalSuffix = ".supplemental-metadata.json";
    private const string JsonSuffix = ".json";

    /// <summary>Full-date folder segments only: a year-only folder ("Fotos de 2025")
    /// pins nothing — a wrong-but-present date would block the better EXIF date from
    /// filling in later.</summary>
    private static readonly Regex FolderDatePattern =
        new(@"(?<!\d)(?<year>20\d{2})-(?<month>\d{2})-(?<day>\d{2})(?!\d)", RegexOptions.Compiled);

    /// <summary>
    /// Indexes sidecar entries by the media path they describe (same directory as the
    /// media file, case-insensitive, both Takeout sidecar layouts).
    /// </summary>
    public static Dictionary<string, ZipArchiveEntry> BuildSidecarIndex(IEnumerable<ZipArchiveEntry> entries)
    {
        var index = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in entries)
        {
            var mediaPath = SidecarMediaPath(entry.FullName.Replace('\\', '/'));
            if (mediaPath is not null)
            {
                index[mediaPath] = entry;
            }
        }

        return index;
    }

    /// <summary>
    /// Resolves the import seed for a media entry: sidecar JSON when one sits next to
    /// the file, with the date folder filling only a missing takenAt.
    /// </summary>
    public static PhotoImportSeed ResolveSeed(string entryFullName, Dictionary<string, ZipArchiveEntry> sidecarIndex)
    {
        var normalized = entryFullName.Replace('\\', '/');
        if (!sidecarIndex.TryGetValue(normalized, out var sidecar))
        {
            return new PhotoImportSeed(FolderDate(normalized), null, null, null, null);
        }

        var parsed = ParseSidecar(sidecar);
        return parsed with { TakenAt = parsed.TakenAt ?? FolderDate(normalized) };
    }

    /// <summary>Maps a sidecar entry name to the media path it describes, or null when
    /// the entry is not a Takeout sidecar.</summary>
    private static string? SidecarMediaPath(string fullName)
    {
        if (fullName.EndsWith(SupplementalSuffix, StringComparison.OrdinalIgnoreCase))
        {
            return fullName[..^SupplementalSuffix.Length];
        }

        if (fullName.EndsWith(JsonSuffix, StringComparison.OrdinalIgnoreCase))
        {
            return fullName[..^JsonSuffix.Length];
        }

        return null;
    }

    /// <summary>Parses a Takeout sidecar JSON; a malformed file yields an empty seed so
    /// the photo itself still imports.</summary>
    private static PhotoImportSeed ParseSidecar(ZipArchiveEntry entry)
    {
        try
        {
            using var stream = entry.Open();
            using var document = JsonDocument.Parse(stream);
            var root = document.RootElement;

            var (latitude, longitude) = Gps(root);
            return new PhotoImportSeed(
                FirstTimestamp(root, "photoTakenTime") ?? FirstTimestamp(root, "creationTime"),
                latitude,
                longitude,
                StringOrNull(root, "title"),
                StringOrNull(root, "description"));
        }
        catch (JsonException)
        {
            return PhotoImportSeed.Empty;
        }
    }

    private static DateTimeOffset? FirstTimestamp(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var container)
            || container.ValueKind != JsonValueKind.Object
            || !container.TryGetProperty("timestamp", out var timestamp)
            || timestamp.ValueKind != JsonValueKind.String
            || !long.TryParse(timestamp.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds)
            || seconds <= 0)
        {
            return null;
        }

        return DateTimeOffset.FromUnixTimeSeconds(seconds);
    }

    private static (double? Latitude, double? Longitude) Gps(JsonElement root)
    {
        // geoDataExif mirrors the file's EXIF GPS and is the more precise of the two.
        foreach (var containerName in (ReadOnlySpan<string>)["geoDataExif", "geoData"])
        {
            if (!root.TryGetProperty(containerName, out var geo) || geo.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var latitude = DoubleOrNull(geo, "latitude");
            var longitude = DoubleOrNull(geo, "longitude");
            // Takeout encodes "no location" as (0, 0).
            if ((latitude is null || latitude == 0) && (longitude is null || longitude == 0))
            {
                continue;
            }

            return (latitude, longitude);
        }

        return (null, null);
    }

    private static string? StringOrNull(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var text = value.GetString();
        return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    }

    private static double? DoubleOrNull(JsonElement container, string propertyName)
    {
        if (!container.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetDouble(out var number) => number,
            _ => null,
        };
    }

    /// <summary>Extracts a full date from a <c>YYYY-MM-DD</c> folder segment, or null.
    /// Year-only folders deliberately yield nothing (see <see cref="FolderDatePattern"/>).</summary>
    public static DateTimeOffset? FolderDate(string entryFullName)
    {
        var match = FolderDatePattern.Match(entryFullName.Replace('\\', '/'));
        if (!match.Success)
        {
            return null;
        }

        var year = int.Parse(match.Groups["year"].Value, CultureInfo.InvariantCulture);
        var month = int.Parse(match.Groups["month"].Value, CultureInfo.InvariantCulture);
        var day = int.Parse(match.Groups["day"].Value, CultureInfo.InvariantCulture);

        try
        {
            return new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.Zero);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Segments like 2024-13-45 are folders, not dates — leave takenAt unset.
            return null;
        }
    }
}
