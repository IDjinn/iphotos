using ImageMagick;
using iPhotos.Application.Abstractions;

namespace iPhotos.Imaging.UnitTests;

public class MagickHeifConverterTests
{
    private static string FixturePath =>
        Path.Combine(AppContext.BaseDirectory, "TestAssets", "heic-fixture.heic");

    [Fact]
    public async Task Convert_DecodesHeicFixture_ToJpegWithDimensions()
    {
        File.Exists(FixturePath).ShouldBeTrue("heic fixture missing — ensure TestAssets are copied to output");

        var converter = new MagickHeifConverter();
        await using var source = File.OpenRead(FixturePath);

        var result = await converter.ConvertToJpegAsync(source);

        result.Width.ShouldBe(1440);
        result.Height.ShouldBe(960);
        result.SizeBytes.ShouldBeGreaterThan(0);

        // Output really is a decodable JPEG.
        result.Content.Seek(0, SeekOrigin.Begin);
        using var jpeg = new MagickImage(result.Content);
        jpeg.Format.ShouldBe(MagickFormat.Jpeg);
        jpeg.Width.ShouldBe(1440u);
        jpeg.Height.ShouldBe(960u);
    }

    [Fact]
    public async Task Convert_GarbageStream_ThrowsInvalidImage()
    {
        var converter = new MagickHeifConverter();
        var garbage = new MemoryStream([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

        await Should.ThrowAsync<InvalidImageException>(
            async () => await converter.ConvertToJpegAsync(garbage));
    }
}
