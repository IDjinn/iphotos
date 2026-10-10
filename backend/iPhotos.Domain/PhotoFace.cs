namespace iPhotos.Domain;

/// <summary>
/// One detected face on a photo (doc 18 §5.1): bbox in preview-pixel coordinates,
/// detection confidence, model versioned embedding and the stored crop blob.
/// Immutable once written — corrections happen through person reassignment.
/// </summary>
public sealed class PhotoFace
{
    public Guid Id { get; set; }
    public Guid PhotoId { get; set; }

    /// <summary>Denormalized from the photo for owner-scoped indexes.</summary>
    public Guid OwnerId { get; set; }

    /// <summary>Cluster membership; null = detected but not attributed to anyone yet.</summary>
    public Guid? PersonId { get; set; }

    /// <summary>Embedding model version, e.g. "buffalo_l" (embeddings of different
    /// models are never compared).</summary>
    public string Model { get; set; } = string.Empty;

    /// <summary>Bounding box in pixels of the image the detection ran on (preview).</summary>
    public float BboxX { get; set; }
    public float BboxY { get; set; }
    public float BboxW { get; set; }
    public float BboxH { get; set; }

    /// <summary>Detector confidence (0..1).</summary>
    public float DetScore { get; set; }

    /// <summary>Unit-norm face embedding.</summary>
    public float[] Embedding { get; set; } = [];

    /// <summary>Blob path of the stored face crop ({owner}/{photo}/faces/{faceId}.jpg).</summary>
    public string CropBlobPath { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public static PhotoFace Create(
        Guid photoId,
        Guid ownerId,
        string model,
        float x, float y, float w, float h,
        float detScore,
        float[] embedding,
        string cropBlobPath,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        PhotoId = photoId,
        OwnerId = ownerId,
        Model = model,
        BboxX = x,
        BboxY = y,
        BboxW = w,
        BboxH = h,
        DetScore = detScore,
        Embedding = embedding,
        CropBlobPath = cropBlobPath,
        CreatedAt = now,
    };

    /// <summary>Ranking weight for cover selection: confidence tempered by face size.</summary>
    public double CoverScore => DetScore * Math.Sqrt(BboxW * (double)BboxH);
}
