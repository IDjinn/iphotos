using iPhotos.Application.Abstractions;
using iPhotos.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;

namespace iPhotos.Imaging.UnitTests;

public class ImageSharpExifExtractorTests
{
    private readonly ImageSharpExifExtractor _extractor = new();

    private static MemoryStream JpegWithExif(ExifProfile profile, int width = 4032, int height = 3024)
    {
        var bytes = ImagingTestHelpers.ToJpegBytes(
            ImagingTestHelpers.PlainImage(width, height),
            image => image.Metadata.ExifProfile = profile);
        return new MemoryStream(bytes);
    }

    [Fact]
    public async Task Extract_ReadsPixelDimensions()
    {
        using var jpeg = JpegWithExif(new ExifProfile(), width: 1280, height: 720);

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.Width.ShouldBe(1280);
        metadata.Height.ShouldBe(720);
    }

    [Fact]
    public async Task Extract_WithFullExif_ReturnsTakenAtCameraAndGps()
    {
        var profile = ImagingTestHelpers.ExifWith(
            dateTimeOriginal: "2025:12:25 10:30:00",
            make: "Google",
            model: "Pixel 9",
            latitude: (new Rational[] { new(22, 1), new(54, 1), new(0, 1) }, "S"),
            longitude: (new Rational[] { new(43, 1), new(12, 1), new(0, 1) }, "W"));
        using var jpeg = JpegWithExif(profile);

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.TakenAt.ShouldBe(new DateTimeOffset(2025, 12, 25, 10, 30, 0, TimeSpan.Zero));
        metadata.CameraMake.ShouldBe("Google");
        metadata.CameraModel.ShouldBe("Pixel 9");
        metadata.GpsLatitude.ShouldNotBeNull();
        metadata.GpsLatitude.Value.ShouldBe(-22.9d, 0.0001);
        metadata.GpsLongitude.ShouldNotBeNull();
        metadata.GpsLongitude.Value.ShouldBe(-43.2d, 0.0001);
    }

    [Fact]
    public async Task Extract_NorthEastRefs_StayPositive()
    {
        var profile = ImagingTestHelpers.ExifWith(
            latitude: (new Rational[] { new(22, 1), new(54, 1), new(0, 1) }, "N"),
            longitude: (new Rational[] { new(43, 1), new(12, 1), new(0, 1) }, "E"));
        using var jpeg = JpegWithExif(profile);

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.GpsLatitude.ShouldNotBeNull();
        metadata.GpsLatitude.Value.ShouldBe(22.9d, 0.0001);
        metadata.GpsLongitude.ShouldNotBeNull();
        metadata.GpsLongitude.Value.ShouldBe(43.2d, 0.0001);
    }

    [Fact]
    public async Task Extract_WithoutExif_ReturnsNullOptionalFields()
    {
        using var jpeg = new MemoryStream(
            ImagingTestHelpers.ToJpegBytes(ImagingTestHelpers.PlainImage(50, 60)));

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.Width.ShouldBe(50);
        metadata.Height.ShouldBe(60);
        metadata.TakenAt.ShouldBeNull();
        metadata.CameraMake.ShouldBeNull();
        metadata.CameraModel.ShouldBeNull();
        metadata.GpsLatitude.ShouldBeNull();
        metadata.GpsLongitude.ShouldBeNull();
    }

    [Fact]
    public async Task Extract_GpsWithoutRef_IsIgnored()
    {
        var profile = new ExifProfile();
        profile.SetValue(ExifTag.GPSLatitude, new Rational[] { new(22, 1), new(54, 1), new(0, 1) });
        using var jpeg = JpegWithExif(profile);

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.GpsLatitude.ShouldBeNull();
    }

    [Fact]
    public async Task Extract_MalformedDateTimeOriginal_IsIgnored()
    {
        var profile = ImagingTestHelpers.ExifWith(dateTimeOriginal: "not-a-date");
        using var jpeg = JpegWithExif(profile);

        var metadata = await _extractor.ExtractAsync(jpeg);

        metadata.TakenAt.ShouldBeNull();
    }

    [Fact]
    public async Task Extract_InvalidImage_Throws()
    {
        using var garbage = new MemoryStream(new byte[] { 9, 9, 9 });

        await Should.ThrowAsync<InvalidImageException>(() => _extractor.ExtractAsync(garbage));
    }
}
