namespace iPhotos.Domain;

public sealed class PhotoVariant
{
    public Guid Id { get; set; }
    public Guid PhotoId { get; set; }
    public VariantKind Kind { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public int Width { get; set; }
    public int Height { get; set; }
    public long SizeBytes { get; set; }
    public string Format { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public static PhotoVariant Create(
        Guid photoId,
        VariantKind kind,
        string blobPath,
        int width,
        int height,
        long sizeBytes,
        string format,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        PhotoId = photoId,
        Kind = kind,
        BlobPath = blobPath,
        Width = width,
        Height = height,
        SizeBytes = sizeBytes,
        Format = format,
        CreatedAt = now,
    };
}
