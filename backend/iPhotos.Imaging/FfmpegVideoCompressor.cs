using System.Diagnostics;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Imaging;

/// <summary>
/// Transcodes oversized videos to a byte budget with ffmpeg (libx264 + AAC):
/// a CRF quality ladder where the first pass whose output fits wins. The
/// stream is materialized to a temp file first (MP4 needs a seekable input).
/// Throws <see cref="InvalidImageException"/> when the smallest ladder step
/// still overshoots the budget.
/// </summary>
public sealed class FfmpegVideoCompressor(IOptions<VideoProcessorOptions> optionsAccessor) : IVideoCompressor
{
    private static readonly int[] CrfLadder = [23, 28, 32, 35];

    public async Task<Stream> CompressToFitAsync(Stream video, long maxBytes, int maxHeight = 0, CancellationToken cancellationToken = default)
    {
        var inputPath = Path.Combine(Path.GetTempPath(), $"iphotos-compress-in-{Guid.NewGuid():N}.bin");
        var outputPath = Path.Combine(Path.GetTempPath(), $"iphotos-compress-out-{Guid.NewGuid():N}.mp4");
        try
        {
            await using (var target = File.Create(inputPath))
            {
                await video.CopyToAsync(target, cancellationToken);
            }

            foreach (var crf in CrfLadder)
            {
                await RunFfmpegAsync(inputPath, outputPath, crf, maxHeight, cancellationToken);
                var info = new FileInfo(outputPath);
                if (info.Exists && info.Length <= maxBytes)
                {
                    var output = new MemoryStream();
                    await using (var encoded = File.OpenRead(outputPath))
                    {
                        await encoded.CopyToAsync(output, cancellationToken);
                    }
                    output.Seek(0, SeekOrigin.Begin);
                    return output;
                }
            }

            throw new InvalidImageException(
                $"The video cannot be transcoded below {maxBytes} bytes.");
        }
        finally
        {
            File.Delete(inputPath);
            File.Delete(outputPath);
        }
    }

    private async Task RunFfmpegAsync(string inputPath, string outputPath, int crf, int maxHeight, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo(optionsAccessor.Value.FfmpegPath)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        var args = new List<string>
        {
            "-nostdin", "-v", "error", "-y",
            "-i", inputPath,
            "-c:v", "libx264", "-preset", "fast", "-crf", crf.ToString(),
        };
        if (maxHeight > 0)
        {
            // The escaped comma keeps min(ih,N) inside the scale filter (a bare comma
            // would split the filtergraph); -2 preserves the display aspect ratio.
            args.AddRange(["-vf", $"scale=-2:min(ih\\,{maxHeight})"]);
        }
        args.AddRange(["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath]);
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        startInfo.RedirectStandardError = true;
        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new InvalidImageException("Could not start ffmpeg. Is it installed?");
        }

        using var cancelRegistration = cancellationToken.Register(() =>
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // already exited
            }
        });

        var stderr = await process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        cancelRegistration.Dispose();

        if (process.ExitCode != 0)
        {
            throw new InvalidImageException($"ffmpeg transcode failed: {stderr[..Math.Min(stderr.Length, 400)]}");
        }
    }
}
