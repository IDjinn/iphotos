namespace iPhotos.Application.Common;

/// <summary>Format identifier stored on PhotoVariant rows, derived from the MIME type.</summary>
public static class VariantFormats
{
    public static string FromMime(string mimeType) => mimeType.ToLowerInvariant() switch
    {
        "image/jpeg" => "jpeg",
        "image/png" => "png",
        "image/webp" => "webp",
        "video/mp4" => "mp4",
        "video/quicktime" => "mov",
        "video/webm" => "webm",
        "video/x-msvideo" => "avi",
        "video/3gpp" => "3gp",
        _ => "bin",
    };
}
