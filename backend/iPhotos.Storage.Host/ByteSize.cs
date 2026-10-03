using System.Globalization;

namespace iPhotos.Storage.Host;

/// <summary>Human-readable byte sizes for logs (e.g. "12 MB", "118.7 KB").</summary>
public static class ByteSize
{
    private const double K = 1024;

    public static string Format(long bytes) => Format((double)bytes, $"{bytes} B");

    private static string Format(double bytes, string raw) => bytes switch
    {
        < K => raw,
        < K * K => Unit(bytes / K, "KB"),
        < K * K * K => Unit(bytes / (K * K), "MB"),
        < K * K * K * K => Unit(bytes / (K * K * K), "GB"),
        _ => Unit(bytes / (K * K * K * K), "TB"),
    };

    private static string Unit(double value, string unit) =>
        string.Create(CultureInfo.InvariantCulture, $"{value:0.#} {unit}");
}
