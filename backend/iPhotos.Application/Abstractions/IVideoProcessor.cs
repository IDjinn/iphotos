namespace iPhotos.Application.Abstractions;

public sealed record VideoInfo(int Width, int Height, double? DurationSeconds, DateTimeOffset? TakenAt);

public sealed record VideoPoster(Stream Content, int Width, int Height, long SizeBytes);

public sealed record VideoFrame(Stream Content, int Width, int Height, long SizeBytes);

public sealed record VideoProcessingResult(VideoInfo Info, VideoPoster Poster);

public interface IVideoProcessor
{
    /// <summary>
    /// Probes a video (display dimensions, duration, creation time). Throws
    /// <see cref="InvalidImageException"/> when the stream is not a decodable video.
    /// </summary>
    Task<VideoInfo> ProbeAsync(Stream video, CancellationToken cancellationToken = default);

    /// <summary>
    /// Probes a video (display dimensions, duration, creation time) and extracts a
    /// poster frame as JPEG in a single pass. Throws <see cref="InvalidImageException"/>
    /// when the stream is not a decodable video.
    /// </summary>
    Task<VideoProcessingResult> ProcessAsync(Stream video, CancellationToken cancellationToken = default);

    /// <summary>
    /// Extracts the frame at <paramref name="offsetSeconds"/> as JPEG (Live Photo
    /// "Set as Key Photo"). Falls back to the first frame when the offset yields no
    /// decodable frame; throws <see cref="InvalidImageException"/> when none does.
    /// </summary>
    Task<VideoFrame> ExtractFrameAsync(Stream video, double offsetSeconds, CancellationToken cancellationToken = default);
}
