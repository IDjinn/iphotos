using System.Diagnostics;
using System.Text.Json;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;

namespace iPhotos.Imaging;

/// <summary>
/// Video probing + poster-frame extraction backed by the ffprobe/ffmpeg binaries
/// (on PATH by default; configurable via <see cref="VideoProcessorOptions"/>). The
/// stream is materialized to a temp file first — MP4 containers need a seekable
/// input, so piping through stdin is not reliable. The poster is the first decodable
/// frame after a short seek (25% of the duration, capped at 1s), with a fallback to
/// the very first frame for clips shorter than the seek point.
/// </summary>
public sealed class FfmpegVideoProcessor(IOptions<VideoProcessorOptions> optionsAccessor) : IVideoProcessor
{
    public async Task<VideoProcessingResult> ProcessAsync(Stream video, CancellationToken cancellationToken = default)
    {
        var tempPath = await MaterializeAsync(video, cancellationToken);
        try
        {
            var info = await ProbeAsync(tempPath, cancellationToken);
            var poster = await ExtractPosterAsync(tempPath, info, cancellationToken);
            return new VideoProcessingResult(info, poster);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    public async Task<VideoInfo> ProbeAsync(Stream video, CancellationToken cancellationToken = default)
    {
        var tempPath = await MaterializeAsync(video, cancellationToken);
        try
        {
            return await ProbeAsync(tempPath, cancellationToken);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    public async Task<VideoFrame> ExtractFrameAsync(Stream video, double offsetSeconds, CancellationToken cancellationToken = default)
    {
        var tempPath = await MaterializeAsync(video, cancellationToken);
        try
        {
            var seek = double.IsFinite(offsetSeconds) && offsetSeconds > 0 ? offsetSeconds : 0;
            var bytes = await ExtractFrameBytesAsync(tempPath, seek, cancellationToken, allowEmptyOutput: true);

            // Keyframes are sparse: a seek past the last one can decode to nothing —
            // retry once from the very first frame before giving up.
            if (bytes.Length == 0 && seek > 0)
            {
                bytes = await ExtractFrameBytesAsync(tempPath, 0, cancellationToken, allowEmptyOutput: true);
            }

            if (bytes.Length == 0)
            {
                throw new InvalidImageException("The video has no decodable frame at that position.");
            }

            var (width, height) = PosterDimensions(bytes, new VideoInfo(0, 0, null, null));
            return new VideoFrame(new MemoryStream(bytes), width, height, bytes.Length);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    /// <summary>MP4 containers need a seekable input, so streams land in a temp file first.</summary>
    private static async Task<string> MaterializeAsync(Stream video, CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"iphotos-video-{Guid.NewGuid():N}.bin");
        await using (var target = File.Create(tempPath))
        {
            await video.CopyToAsync(target, cancellationToken);
        }

        return tempPath;
    }

    private async Task<VideoInfo> ProbeAsync(string path, CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value;
        var stdout = await RunBinaryAsync(
            options.FfprobePath,
            args => args
                .Add("-v").Add("error")
                .Add("-print_format").Add("json")
                .Add("-show_format")
                .Add("-show_streams")
                .Add(path),
            cancellationToken);

        VideoInfo info;
        try
        {
            info = ParseProbe(stdout);
        }
        catch (JsonException ex)
        {
            throw new InvalidImageException($"Could not parse ffprobe output: {ex.Message}");
        }

        if (info is null)
        {
            throw new InvalidImageException("The stream is not a decodable video (no video stream found).");
        }

        return info;
    }

    private static VideoInfo? ParseProbe(byte[] json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var stream = root.TryGetProperty("streams", out var streams)
            ? streams.EnumerateArray()
                .FirstOrDefault(s => s.TryGetProperty("codec_type", out var t) && t.ValueEquals("video"))
            : default;

        if (stream.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            || !stream.TryGetProperty("width", out var widthEl)
            || !stream.TryGetProperty("height", out var heightEl))
        {
            return null;
        }

        var (width, height) = ((int)widthEl.GetInt32(), (int)heightEl.GetInt32());

        // Rotation is stored as display matrix side data (newer ffprobe) or a rotate
        // tag (older): portrait phone clips report swapped dimensions after autorotation.
        var rotation = ReadRotation(stream);
        if (rotation is 90 or -90 or 270 or -270)
        {
            (width, height) = (height, width);
        }

        double? duration = null;
        DateTimeOffset? takenAt = null;
        if (root.TryGetProperty("format", out var format))
        {
            if (format.TryGetProperty("duration", out var durationEl)
                && double.TryParse(durationEl.GetString(), System.Globalization.CultureInfo.InvariantCulture, out var parsed))
            {
                duration = parsed;
            }

            if (format.TryGetProperty("tags", out var tags)
                && tags.TryGetProperty("creation_time", out var createdEl)
                && DateTimeOffset.TryParse(createdEl.GetString(), System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AssumeUniversal, out var created))
            {
                takenAt = created;
            }
        }

        return new VideoInfo(width, height, duration, takenAt);
    }

    private static int? ReadRotation(JsonElement stream)
    {
        if (stream.TryGetProperty("side_data_list", out var sideData))
        {
            foreach (var side in sideData.EnumerateArray())
            {
                if (side.TryGetProperty("rotation", out var rotation) && rotation.TryGetInt32(out var degrees))
                {
                    return degrees;
                }
            }
        }

        if (stream.TryGetProperty("tags", out var tags)
            && tags.TryGetProperty("rotate", out var rotate)
            && int.TryParse(rotate.GetString(), out var tagDegrees))
        {
            return tagDegrees;
        }

        return null;
    }

    private async Task<VideoPoster> ExtractPosterAsync(string path, VideoInfo info, CancellationToken cancellationToken)
    {
        // Seek a little into the clip so the poster is not a black/lead-in frame;
        // shorter than the seek point → retry from the very first frame.
        var seek = info.DurationSeconds is { } duration ? Math.Min(1.0, duration / 4) : 1.0;
        var bytes = await ExtractFrameBytesAsync(path, seek, cancellationToken, allowEmptyOutput: true);

        if (bytes.Length == 0)
        {
            bytes = await ExtractFrameBytesAsync(path, 0, cancellationToken);
        }

        if (bytes.Length == 0)
        {
            throw new InvalidImageException("The video has no decodable frame for the poster.");
        }

        var (width, height) = PosterDimensions(bytes, info);
        return new VideoPoster(new MemoryStream(bytes), width, height, bytes.Length);
    }

    private Task<byte[]> ExtractFrameBytesAsync(
        string path, double seek, CancellationToken cancellationToken, bool allowEmptyOutput = false) =>
        RunBinaryAsync(
            optionsAccessor.Value.FfmpegPath,
            args => args
                .Add("-nostdin")
                .Add("-v").Add("error")
                .Add("-ss").Add(seek.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture))
                .Add("-i").Add(path)
                .Add("-frames:v").Add("1")
                .Add("-f").Add("image2pipe")
                .Add("-vcodec").Add("mjpeg")
                .Add("pipe:1"),
            cancellationToken,
            allowEmptyOutput);

    /// <summary>Exact poster dimensions from the JPEG header; probe dims as fallback.</summary>
    private static (int Width, int Height) PosterDimensions(byte[] jpeg, VideoInfo fallback)
    {
        try
        {
            var imageInfo = Image.Identify(jpeg);
            if (imageInfo is not null)
            {
                return (imageInfo.Width, imageInfo.Height);
            }
        }
        catch (SixLabors.ImageSharp.UnknownImageFormatException)
        {
            // fall through to the probe dimensions
        }

        return (fallback.Width, fallback.Height);
    }

    private static async Task<byte[]> RunBinaryAsync(
        string fileName,
        Action<ProcessArgumentBuilder> build,
        CancellationToken cancellationToken,
        bool allowEmptyOutput = false)
    {
        var startInfo = new ProcessStartInfo(fileName) { UseShellExecute = false, CreateNoWindow = true };
        build(new ProcessArgumentBuilder(startInfo.ArgumentList));
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;

        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new InvalidImageException($"Could not start '{fileName}'. Is it installed?");
        }

        using var cancelRegistration = cancellationToken.Register(() =>
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // Process already exited.
            }
        });

        var output = new MemoryStream();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.StandardOutput.BaseStream.CopyToAsync(output, cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        await stderrTask;

        if (process.ExitCode != 0 || (!allowEmptyOutput && output.Length == 0))
        {
            var stderr = stderrTask.Status == TaskStatus.RanToCompletion
                ? stderrTask.Result.Trim()
                : string.Empty;
            throw new InvalidImageException(
                $"Video processing failed ({Path.GetFileNameWithoutExtension(fileName)} " +
                $"exit {process.ExitCode}): {Truncate(stderr)}");
        }

        return output.ToArray();
    }

    private static string Truncate(string text) =>
        text.Length <= 300 ? text : text[..300] + "…";
}

/// <summary>Small fluent wrapper so command arguments stay readable and properly quoted.</summary>
public sealed class ProcessArgumentBuilder(System.Collections.ObjectModel.Collection<string> arguments)
{
    public ProcessArgumentBuilder Add(string value)
    {
        arguments.Add(value);
        return this;
    }
}
