using ImageMagick;
using iPhotos.Application.Abstractions;

namespace iPhotos.Imaging;

/// <summary>
/// HEIC/HEIF → JPEG conversion backed by Magick.NET (libheif delegate). Profiles
/// (EXIF, ICC) attached to the source image are carried over to the JPEG output
/// so indexing still extracts taken-at/camera/GPS after the transcode.
/// </summary>
public sealed class MagickHeifConverter : IHeifConverter
{
    public async Task<HeifConversionResult> ConvertToJpegAsync(Stream heif, CancellationToken cancellationToken = default)
    {
        using var image = new MagickImage();
        try
        {
            await image.ReadAsync(heif, cancellationToken);
        }
        catch (MagickException ex)
        {
            throw new InvalidImageException($"Could not decode HEIC/HEIF image: {ex.Message}");
        }

        var output = new MemoryStream();
        image.Quality = 90;
        await image.WriteAsync(output, MagickFormat.Jpeg, cancellationToken);
        output.Seek(0, SeekOrigin.Begin);

        return new HeifConversionResult(output, (int)image.Width, (int)image.Height, output.Length);
    }
}
