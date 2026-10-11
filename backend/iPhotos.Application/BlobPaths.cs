using System.Security.Cryptography;
using iPhotos.Application.Abstractions;

namespace iPhotos.Application;

/// <summary>Blob path scheme: {ownerId}/{photoId}/{name}. Relative to the storage root.</summary>
public static class BlobPaths
{
    public static string Original(Guid ownerId, Guid photoId, string fileName) =>
        $"{ownerId}/{photoId}/original{ExtensionOf(fileName)}";

    public static string Thumbnail(Guid ownerId, Guid photoId) => $"{ownerId}/{photoId}/thumb.jpg";

    /// <summary>Paired Live Photo motion clip (VariantKind.Motion).</summary>
    public static string Motion(Guid ownerId, Guid photoId, string fileName) =>
        $"{ownerId}/{photoId}/motion{ExtensionOf(fileName)}";

    /// <summary>Staging blob for a zip import job; deleted once the worker finishes with it.</summary>
    public static string Import(Guid ownerId, Guid jobId) => $"{ownerId}/imports/{jobId}.zip";

    public static string Preview(Guid ownerId, Guid photoId) => $"{ownerId}/{photoId}/preview.jpg";

    /// <summary>Square face crop (doc 18 §5.1) backing person covers and merge UI chips.</summary>
    public static string FaceCrop(Guid ownerId, Guid photoId, Guid faceId) =>
        $"{ownerId}/{photoId}/faces/{faceId}.jpg";

    public static string FolderOf(string blobPath)
    {
        var idx = blobPath.LastIndexOf('/');
        return idx <= 0 ? string.Empty : blobPath[..idx];
    }

    private static string ExtensionOf(string fileName)
    {
        var ext = Path.GetExtension(fileName);
        return string.IsNullOrEmpty(ext) ? string.Empty : ext.ToLowerInvariant();
    }
}

public sealed class Sha256ContentHasher : IContentHasher
{
    public string ComputeHash(Stream content)
    {
        var hash = SHA256.HashData(content);
        content.Seek(0, SeekOrigin.Begin);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
