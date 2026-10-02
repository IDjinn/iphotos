namespace iPhotos.Application.Abstractions;

public sealed record HeifConversionResult(Stream Content, int Width, int Height, long SizeBytes);

public interface IHeifConverter
{
    /// <summary>
    /// Transcodes a HEIC/HEIF image to JPEG, preserving EXIF and ICC metadata so the
    /// downstream indexing pipeline still sees taken-at/camera/GPS information.
    /// Throws <see cref="InvalidImageException"/> when the stream is not a decodable image.
    /// </summary>
    Task<HeifConversionResult> ConvertToJpegAsync(Stream heif, CancellationToken cancellationToken = default);
}
