namespace iPhotos.Application.Common;

/// <summary>Format identifier stored on PhotoVariant rows, derived from the MIME type.</summary>
public static class VariantFormats
{
    public static string FromMime(string mimeType) => mimeType.ToLowerInvariant() switch
    {
        "image/jpeg" => "jpeg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "bin",
    };
}
