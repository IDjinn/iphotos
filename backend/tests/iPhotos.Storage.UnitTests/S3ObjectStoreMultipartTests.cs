using iPhotos.Storage.Providers;

namespace iPhotos.Storage.UnitTests;

public class S3ObjectStoreMultipartTests
{
    [Fact]
    public void SeekableStreamAboveThresholdUsesMultipart()
    {
        using var payload = new MemoryStream(new byte[S3ObjectStore.MultipartThresholdBytes + 1]);
        S3ObjectStore.ShouldUseMultipart(payload).ShouldBeTrue();
    }

    [Fact]
    public void SeekableStreamAtOrBelowThresholdKeepsSinglePut()
    {
        using var at = new MemoryStream(new byte[S3ObjectStore.MultipartThresholdBytes]);
        using var below = new MemoryStream(new byte[1024]);
        using var empty = new MemoryStream();
        S3ObjectStore.ShouldUseMultipart(at).ShouldBeFalse();
        S3ObjectStore.ShouldUseMultipart(below).ShouldBeFalse();
        S3ObjectStore.ShouldUseMultipart(empty).ShouldBeFalse();
    }

    [Fact]
    public void NonSeekableStreamNeverSelectsMultipart()
    {
        // HTTP request bodies arrive non-seekable; they are spilled to a temp file first.
        using var payload = new NonSeekableStream(new byte[S3ObjectStore.MultipartThresholdBytes + 1]);
        S3ObjectStore.ShouldUseMultipart(payload).ShouldBeFalse();
    }

    private sealed class NonSeekableStream(byte[] buffer) : MemoryStream(buffer)
    {
        public override bool CanSeek => false;
    }
}
