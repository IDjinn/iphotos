namespace iPhotos.Domain;

/// <summary>
/// One scene label on a photo (doc 18 §8), produced by the backend vision
/// endpoint. Canonical form: lowercase English tag; clients localize for display.
/// Re-running the labeler replaces the photo's set (PK photo_id + label).
/// </summary>
public sealed class PhotoLabel
{
    public const int MaxLabelLength = 100;

    public Guid PhotoId { get; set; }
    public Guid OwnerId { get; set; }
    public string Label { get; set; } = string.Empty;

    /// <summary>Vision model confidence (0..1).</summary>
    public float Score { get; set; }

    /// <summary>Vision model that produced the label (e.g. "qwen2.5vl:7b").</summary>
    public string Model { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public static PhotoLabel Create(Guid photoId, Guid ownerId, string label, float score, string model, DateTimeOffset now) => new()
    {
        PhotoId = photoId,
        OwnerId = ownerId,
        Label = Normalize(label),
        Score = score,
        Model = model,
        CreatedAt = now,
    };

    /// <summary>Canonical label form: lowercase, trimmed, single-spaced.</summary>
    public static string Normalize(string label) =>
        string.Join(' ', label.Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    /// <summary>True when the label fits the canonical constraints (non-empty, length cap).</summary>
    public static bool IsValid(string label) =>
        label.Length is > 0 and <= MaxLabelLength;
}
