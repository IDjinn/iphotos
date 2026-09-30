using System.Globalization;
using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.Processing;

namespace iPhotos.Imaging;

/// <summary>
/// Extracts indexing metadata (dimensions, taken-at, camera, GPS) from EXIF.
/// EXIF has no timezone: DateTimeOriginal is interpreted as UTC by convention.
/// </summary>
public sealed class ImageSharpExifExtractor : IExifExtractor
{
    private const string ExifDateFormat = "yyyy:MM:dd HH:mm:ss";

    public async Task<PhotoMetadata> ExtractAsync(Stream original, CancellationToken cancellationToken = default)
    {
        using var image = await ImagingLoad.LoadAsync(original, cancellationToken);
        image.Mutate(x => x.AutoOrient());

        var exif = image.Metadata.ExifProfile;

        return new PhotoMetadata(
            Width: image.Width,
            Height: image.Height,
            TakenAt: ReadTakenAt(exif),
            CameraMake: ReadString(exif, ExifTag.Make),
            CameraModel: ReadString(exif, ExifTag.Model),
            GpsLatitude: ReadGps(exif, ExifTag.GPSLatitude, ExifTag.GPSLatitudeRef, negativeRef: "S"),
            GpsLongitude: ReadGps(exif, ExifTag.GPSLongitude, ExifTag.GPSLongitudeRef, negativeRef: "W"));
    }

    private static DateTimeOffset? ReadTakenAt(ExifProfile? exif)
    {
        if (exif?.TryGetValue(ExifTag.DateTimeOriginal, out var value) != true
            || string.IsNullOrWhiteSpace(value.Value))
        {
            return null;
        }

        return DateTime.TryParseExact(
                value.Value,
                ExifDateFormat,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed)
            ? new DateTimeOffset(parsed, TimeSpan.Zero)
            : null;
    }

    private static string? ReadString(ExifProfile? exif, ExifTag<string> tag) =>
        exif?.TryGetValue(tag, out var value) == true && !string.IsNullOrWhiteSpace(value.Value)
            ? value.Value
            : null;

    private static double? ReadGps(
        ExifProfile? exif,
        ExifTag<Rational[]> valueTag,
        ExifTag<string> refTag,
        string negativeRef)
    {
        if (exif?.TryGetValue(valueTag, out var value) != true
            || value.Value is not { Length: 3 } components
            || exif.TryGetValue(refTag, out var reference) != true
            || string.IsNullOrWhiteSpace(reference.Value))
        {
            return null;
        }

        var coordinate = components[0].ToDouble()
            + components[1].ToDouble() / 60.0
            + components[2].ToDouble() / 3600.0;

        return reference.Value.Trim().Equals(negativeRef, StringComparison.OrdinalIgnoreCase)
            ? -coordinate
            : coordinate;
    }
}
