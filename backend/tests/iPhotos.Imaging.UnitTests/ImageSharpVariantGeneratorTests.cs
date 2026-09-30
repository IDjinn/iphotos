using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Domain;
using iPhotos.Imaging;

namespace iPhotos.Imaging.UnitTests;

public class ImageSharpVariantGeneratorTests
{
    private static ImageSharpVariantGenerator NewGenerator(ImagingOptions? options = null) =>
        new(options ?? new ImagingOptions());

    private static MemoryStream Jpeg(int width, int height)
    {
        var bytes = ImagingTestHelpers.ToJpegBytes(ImagingTestHelpers.PlainImage(width, height));
        return new MemoryStream(bytes);
    }

    [Fact]
    public async Task Generate_Thumbnail_ResizesToLongEdge_KeepingAspectRatio()
    {
        using var original = Jpeg(640, 200);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Thumbnail);

        output.Width.ShouldBe(320);
        output.Height.ShouldBe(100);
        output.Format.ShouldBe("jpeg");
        output.Content.Length.ShouldBe(output.SizeBytes);
        output.Content.Position.ShouldBe(0);
    }

    [Fact]
    public async Task Generate_Preview_ResizesToLongEdge()
    {
        using var original = Jpeg(4000, 1000);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Preview);

        output.Width.ShouldBe(2048);
        output.Height.ShouldBe(512);
        output.Format.ShouldBe("jpeg");
    }

    [Fact]
    public async Task Generate_Preview_DoesNotUpscaleSmallImages()
    {
        using var original = Jpeg(640, 200);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Preview);

        output.Width.ShouldBe(640);
        output.Height.ShouldBe(200);
    }

    [Fact]
    public async Task Generate_Thumbnail_DoesNotUpscaleTinyImages()
    {
        using var original = Jpeg(100, 40);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Thumbnail);

        output.Width.ShouldBe(100);
        output.Height.ShouldBe(40);
    }

    [Fact]
    public async Task Generate_OutputIsDecodableJpeg()
    {
        using var original = Jpeg(640, 200);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Thumbnail);

        using var decoded = await SixLabors.ImageSharp.Image.LoadAsync(output.Content);
        decoded.Width.ShouldBe(320);
        decoded.Height.ShouldBe(100);
        decoded.Metadata.DecodedImageFormat?.Name.ShouldBe("JPEG");
    }

    [Fact]
    public async Task Generate_RespectsOrientation()
    {
        // 200x600 image with EXIF orientation "rotate 90": visual dimensions become 600x200,
        // so the thumbnail long edge (600) must be downsized to 320.
        var bytes = ImagingTestHelpers.ToJpegBytes(
            ImagingTestHelpers.PlainImage(200, 600),
            image => image.Metadata.ExifProfile = ImagingTestHelpers.ExifWith()
                .Tap(p => p.SetValue(SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifTag.Orientation, (ushort)6)));
        using var original = new MemoryStream(bytes);

        var output = await NewGenerator().GenerateAsync(original, VariantKind.Thumbnail);

        output.Width.ShouldBe(320);
        output.Height.ShouldBe(107); // 200 * 320/600 ≈ 106.67 → 107
    }

    [Fact]
    public async Task Generate_InvalidImage_Throws()
    {
        using var garbage = new MemoryStream(new byte[] { 1, 2, 3, 4, 5 });

        await Should.ThrowAsync<InvalidImageException>(
            () => NewGenerator().GenerateAsync(garbage, VariantKind.Thumbnail));
    }

    [Fact]
    public async Task Generate_OriginalKind_Throws()
    {
        using var original = Jpeg(640, 200);

        await Should.ThrowAsync<ArgumentOutOfRangeException>(
            () => NewGenerator().GenerateAsync(original, VariantKind.Original));
    }

    [Fact]
    public async Task Generate_RespectsCustomOptions()
    {
        using var original = Jpeg(1000, 500);
        var generator = NewGenerator(new ImagingOptions { ThumbnailLongEdge = 100 });

        var output = await generator.GenerateAsync(original, VariantKind.Thumbnail);

        output.Width.ShouldBe(100);
        output.Height.ShouldBe(50);
    }
}

internal static class TapExtensions
{
    public static T Tap<T>(this T value, Action<T> action)
    {
        action(value);
        return value;
    }
}
