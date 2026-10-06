using iPhotos.Application.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace iPhotos.Imaging;

/// <summary>
/// Shrinks oversized images to a byte budget with ImageSharp: a quality ladder
/// at the current size, halving the long edge between ladders until the JPEG
/// output fits. Never produces anything larger than the budget; the smallest
/// acceptable quality wins. Throws <see cref="InvalidImageException"/> when
/// even the smallest ladder step overshoots.
/// </summary>
public sealed class ImageSharpImageCompressor : IImageCompressor
{
    private static readonly int[] QualityLadder = [85, 70, 55, 40, 30];

    public async Task<Stream> CompressToFitAsync(Stream image, long maxBytes, CancellationToken cancellationToken = default)
    {
        if (!image.CanSeek)
        {
            var buffered = new MemoryStream();
            await image.CopyToAsync(buffered, cancellationToken);
            buffered.Seek(0, SeekOrigin.Begin);
            image = buffered;
        }

        using var loaded = await ImagingLoad.LoadAsync(image, cancellationToken);
        loaded.Mutate(x => x.AutoOrient());

        var longEdge = Math.Max(loaded.Width, loaded.Height);
        while (true)
        {
            foreach (var quality in QualityLadder)
            {
                var output = await EncodeAsync(loaded, longEdge, quality, cancellationToken);
                if (output.Length <= maxBytes)
                {
                    return output;
                }
                output.Dispose();
            }

            if (longEdge <= 64)
            {
                throw new InvalidImageException(
                    $"The image cannot be compressed below {maxBytes} bytes.");
            }

            longEdge /= 2;
        }
    }

    private static async Task<MemoryStream> EncodeAsync(Image image, int longEdge, int quality, CancellationToken cancellationToken)
    {
        using var scaled = image.Clone(context =>
            context.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new Size(longEdge, longEdge),
            }));

        var output = new MemoryStream();
        await scaled.SaveAsJpegAsync(output, new JpegEncoder { Quality = quality }, cancellationToken);
        output.Seek(0, SeekOrigin.Begin);
        return output;
    }
}
