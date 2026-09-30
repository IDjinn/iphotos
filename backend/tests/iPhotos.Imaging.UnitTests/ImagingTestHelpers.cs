using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;

namespace iPhotos.Imaging.UnitTests;

public static class ImagingTestHelpers
{
    /// <summary>Encodes an in-memory image as JPEG with optional EXIF metadata.</summary>
    public static byte[] ToJpegBytes(Action<Image>? configure = null)
    {
        return ToJpegBytes(new Image<Rgba32>(8, 8), configure);
    }

    public static byte[] ToJpegBytes(Image image, Action<Image>? configure = null)
    {
        configure?.Invoke(image);
        using var output = new MemoryStream();
        image.SaveAsJpeg(output);
        return output.ToArray();
    }

    public static Image PlainImage(int width, int height) => new Image<Rgba32>(width, height);

    public static ExifProfile ExifWith(
        string? dateTimeOriginal = null,
        string? make = null,
        string? model = null,
        (Rational[] Value, string Ref)? latitude = null,
        (Rational[] Value, string Ref)? longitude = null)
    {
        var profile = new ExifProfile();
        if (dateTimeOriginal is not null)
        {
            profile.SetValue(ExifTag.DateTimeOriginal, dateTimeOriginal);
        }

        if (make is not null)
        {
            profile.SetValue(ExifTag.Make, make);
        }

        if (model is not null)
        {
            profile.SetValue(ExifTag.Model, model);
        }

        if (latitude is not null)
        {
            profile.SetValue(ExifTag.GPSLatitude, latitude.Value.Value);
            profile.SetValue(ExifTag.GPSLatitudeRef, latitude.Value.Ref);
        }

        if (longitude is not null)
        {
            profile.SetValue(ExifTag.GPSLongitude, longitude.Value.Value);
            profile.SetValue(ExifTag.GPSLongitudeRef, longitude.Value.Ref);
        }

        return profile;
    }
}
