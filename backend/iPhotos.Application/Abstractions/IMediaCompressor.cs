using iPhotos.Application.Common;

namespace iPhotos.Application.Abstractions;

/// <summary>
/// Shrinks an image so it fits within a byte budget (quality/size ladder);
/// the returned stream is positioned at 0. Throws
/// <see cref="InvalidImageException"/> when the budget is unreachable.
/// </summary>
public interface IImageCompressor
{
    Task<Stream> CompressToFitAsync(Stream image, long maxBytes, CancellationToken cancellationToken = default);
}

/// <summary>
/// Transcodes a video so it fits within a byte budget (quality ladder);
/// the returned stream is positioned at 0 and is seekable. Throws
/// <see cref="InvalidImageException"/> when the budget is unreachable.
/// </summary>
public interface IVideoCompressor
{
    Task<Stream> CompressToFitAsync(Stream video, long maxBytes, CancellationToken cancellationToken = default);
}
