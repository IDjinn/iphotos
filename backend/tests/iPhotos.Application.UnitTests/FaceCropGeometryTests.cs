using iPhotos.Application.Services;

namespace iPhotos.Application.UnitTests;

public class FaceCropGeometryTests
{
    [Fact]
    public void Expand_ZeroPadding_KeepsBBoxUntouched()
    {
        var rect = FaceCropGeometry.Expand(100, 80, 50, 60, 0f);

        Assert.Equal(100f, rect.X);
        Assert.Equal(80f, rect.Y);
        Assert.Equal(50f, rect.Width);
        Assert.Equal(60f, rect.Height);
    }

    [Fact]
    public void Expand_DefaultPadding_GrowsEverySideByFortyPercentOfFace()
    {
        var rect = FaceCropGeometry.Expand(100, 80, 50, 60, 0.4f);

        Assert.Equal(100 - 20, rect.X);
        Assert.Equal(80 - 24, rect.Y);
        Assert.Equal(50 + 2 * 20, rect.Width);
        Assert.Equal(60 + 2 * 24, rect.Height);
    }

    [Fact]
    public void Expand_FaceAtImageCorner_ProducesNegativeOrigin_CropperClamps()
    {
        var rect = FaceCropGeometry.Expand(0, 0, 100, 100, 0.4f);

        Assert.Equal(-40, rect.X);
        Assert.Equal(-40, rect.Y);
        Assert.Equal(180, rect.Width);
        Assert.Equal(180, rect.Height);
    }

    [Fact]
    public void Expand_NegativePadding_CountsAsZero()
    {
        var rect = FaceCropGeometry.Expand(10, 10, 50, 50, -0.5f);

        Assert.Equal(10f, rect.X);
        Assert.Equal(10f, rect.Y);
        Assert.Equal(50f, rect.Width);
        Assert.Equal(50f, rect.Height);
    }
}
