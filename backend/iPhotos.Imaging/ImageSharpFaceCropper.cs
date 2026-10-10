using iPhotos.Application.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace iPhotos.Imaging;

/// <summary>
/// Crops a detected face bbox out of the source image (the photo preview) into a
/// small square-ish JPEG for person covers and merge UI chips (doc 18 §6.2). The
/// bbox is clamped to image bounds; EXIF orientation is respected so crops match
/// what users see.
/// </summary>
public sealed class ImageSharpFaceCropper : IFaceCropper
{
    public async Task<Stream> CropAsync(
        Stream image, float x, float y, float width, float height, int longEdge, CancellationToken cancellationToken = default)
    {
        if (!image.CanSeek)
        {
            var buffered = new MemoryStream();
            await image.CopyToAsync(buffered, cancellationToken);
            buffered.Seek(0, SeekOrigin.Begin);
            image = buffered;
        }

        image.Seek(0, SeekOrigin.Begin);
        using var loaded = await ImagingLoad.LoadAsync(image, cancellationToken);
        loaded.Mutate(mutate => mutate.AutoOrient());

        // Clamp the bbox to the oriented image (detections can round outside edges).
        var rect = Rectangle.Intersect(
            new Rectangle(
                (int)MathF.Floor(x), (int)MathF.Floor(y),
                Math.Max(1, (int)MathF.Ceiling(width)), Math.Max(1, (int)MathF.Ceiling(height))),
            new Rectangle(0, 0, loaded.Width, loaded.Height));
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            throw new InvalidImageException($"Face bbox ({x}, {y}, {width}×{height}) falls outside the image.");
        }

        var scale = longEdge / (float)Math.Max(rect.Width, rect.Height);
        var targetWidth = Math.Clamp((int)MathF.Ceiling(rect.Width * scale), 1, longEdge);
        var targetHeight = Math.Clamp((int)MathF.Ceiling(rect.Height * scale), 1, longEdge);

        using var cropped = loaded.Clone(context => context.Crop(rect).Resize(targetWidth, targetHeight));
        var output = new MemoryStream();
        await cropped.SaveAsJpegAsync(output, new JpegEncoder { Quality = 80 }, cancellationToken);
        output.Seek(0, SeekOrigin.Begin);
        return output;
    }
}
