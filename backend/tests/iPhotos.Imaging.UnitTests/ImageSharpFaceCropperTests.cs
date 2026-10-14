using iPhotos.Application.Abstractions;
using iPhotos.Imaging;
using SixLabors.ImageSharp;

namespace iPhotos.Imaging.UnitTests;

public class ImageSharpFaceCropperTests
{
    private readonly ImageSharpFaceCropper cropper = new();

    private static MemoryStream Jpeg(int width, int height) =>
        new(ImagingTestHelpers.ToJpegBytes(ImagingTestHelpers.PlainImage(width, height)));

    [Fact]
    public async Task Crop_TightBBox_ScalesLongEdgeKeepingAspectRatio()
    {
        using var source = Jpeg(100, 100);

        using var output = await cropper.CropAsync(source, 25, 25, 50, 50, FaceProcessingLongEdge);

        using var image = Image.Load(output);
        image.Width.ShouldBe(160);
        image.Height.ShouldBe(160);
    }

    [Fact]
    public async Task Crop_ExpandedRectPastImageEdges_ClampsToImageBounds()
    {
        using var source = Jpeg(200, 100);

        // A face at the corner (0,0,100,100) with 0.4 padding — negative origin
        // must clamp to the image instead of throwing or producing offsets.
        using var output = await cropper.CropAsync(source, -40, -40, 180, 180, FaceProcessingLongEdge);

        using var image = Image.Load(output);
        // Clamped rect is (0,0,140,100); the long edge still scales to 160.
        image.Width.ShouldBe(160);
        image.Height.ShouldBe(115);
    }

    [Fact]
    public async Task Crop_RectFullyOutsideImage_Throws()
    {
        using var source = Jpeg(100, 100);

        await Should.ThrowAsync<InvalidImageException>(
            () => cropper.CropAsync(source, 200, 200, 50, 50, FaceProcessingLongEdge));
    }

    /// <summary>Mirrors FaceProcessingService.FaceCropLongEdge without coupling the
    /// imaging tests to the Application services assembly surface.</summary>
    private const int FaceProcessingLongEdge = 160;
}
