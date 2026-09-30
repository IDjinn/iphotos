using iPhotos.Storage;

namespace iPhotos.Storage.UnitTests;

public class ObjectKeyTests
{
    [Theory]
    [InlineData("owner/photo/original.jpg")]
    [InlineData("a/b/c")]
    [InlineData("single")]
    [InlineData("dir/file.txt")]
    public void Normalize_ValidKey_ReturnsCanonicalForm(string key)
    {
        var normalized = ObjectKey.Normalize(key);

        normalized.ShouldBe(key);
    }

    [Fact]
    public void Normalize_BackslashSeparators_NormalizesToSlash()
    {
        ObjectKey.Normalize(@"owner\photo\original.jpg").ShouldBe("owner/photo/original.jpg");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("/absolute/path")]
    [InlineData("owner//photo")]
    [InlineData("owner/../secret")]
    [InlineData("./file")]
    [InlineData("owner/fi le.jpg")]
    [InlineData("owner/fotoção.jpg")]
    [InlineData("owner/a:b.jpg")]
    public void Normalize_InvalidKey_Throws(string key)
    {
        Should.Throw<InvalidObjectKeyException>(() => ObjectKey.Normalize(key));
    }

    [Fact]
    public void Normalize_KeyAboveMaxLength_Throws()
    {
        var key = new string('a', ObjectKey.MaxLength + 1);

        Should.Throw<InvalidObjectKeyException>(() => ObjectKey.Normalize(key));
    }

    [Fact]
    public void Normalize_KeyAtMaxLength_Passes()
    {
        var key = $"{new string('a', ObjectKey.MaxLength - 2)}.j";

        ObjectKey.Normalize(key).ShouldBe(key);
    }

    [Fact]
    public void EscapePath_ReservesSlashes_EscapesSegmentsOnly()
    {
        var escaped = ObjectKey.EscapePath("owner id/photo 1/original.jpg");

        escaped.ShouldBe("owner%20id/photo%201/original.jpg");
    }
}
