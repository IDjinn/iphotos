using iPhotos.Domain;

namespace iPhotos.Application.Abstractions;

public sealed record VariantOutput(Stream Content, int Width, int Height, string Format, long SizeBytes);

public interface IImageVariantGenerator
{
    /// <summary>
    /// Generates a derived image for the given kind. Never upscales: images smaller than
    /// the target long edge are encoded as-is (only re-encoded to the output format).
    /// </summary>
    Task<VariantOutput> GenerateAsync(Stream original, VariantKind kind, CancellationToken cancellationToken = default);
}

public interface IExifExtractor
{
    /// <summary>
    /// Extracts indexing metadata (dimensions, taken-at, camera, GPS) from an image stream.
    /// Throws <see cref="InvalidImageException"/> when the stream is not a decodable image.
    /// </summary>
    Task<PhotoMetadata> ExtractAsync(Stream original, CancellationToken cancellationToken = default);
}

public class InvalidImageException(string message) : Exception(message);

public interface IContentHasher
{
    /// <summary>Computes the hex SHA-256 of the stream. The stream position is reset afterwards.</summary>
    string ComputeHash(Stream content);
}
