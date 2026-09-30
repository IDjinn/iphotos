using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace iPhotos.Imaging;

/// <summary>
/// Generates derived variants with ImageSharp: thumbnails (320px) and previews (2048px),
/// both JPEG, never upscaling and respecting EXIF orientation.
/// </summary>
public sealed class ImageSharpVariantGenerator(ImagingOptions options) : IImageVariantGenerator
{
    public async Task<VariantOutput> GenerateAsync(Stream original, VariantKind kind, CancellationToken cancellationToken = default)
    {
        var (longEdge, quality) = kind switch
        {
            VariantKind.Thumbnail => (options.ThumbnailLongEdge, options.ThumbnailQuality),
            VariantKind.Preview => (options.PreviewLongEdge, options.PreviewQuality),
            _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Only Thumbnail and Preview variants are generated."),
        };

        using var image = await ImagingLoad.LoadAsync(original, cancellationToken);
        image.Mutate(x => x.AutoOrient());

        // ResizeMode.Max upscales to fit; variants never upscale, so guard explicitly.
        if (Math.Max(image.Width, image.Height) > longEdge)
        {
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new Size(longEdge, longEdge),
            }));
        }

        var output = new MemoryStream();
        await image.SaveAsJpegAsync(output, new JpegEncoder { Quality = quality }, cancellationToken);
        output.Seek(0, SeekOrigin.Begin);

        return new VariantOutput(output, image.Width, image.Height, "jpeg", output.Length);
    }
}

internal static class ImagingLoad
{
    public static async Task<Image> LoadAsync(Stream stream, CancellationToken cancellationToken)
    {
        try
        {
            return await Image.LoadAsync(stream, cancellationToken);
        }
        catch (Exception ex)
        {
            throw new InvalidImageException($"The stream is not a decodable image: {ex.Message}");
        }
    }
}
