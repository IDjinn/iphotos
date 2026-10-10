namespace iPhotos.Domain;

/// <summary>
/// An owner-scoped face cluster (doc 18): a Google-Photos-style "person" that
/// groups faces the clusterer considers the same individual. Named by the user;
/// <see cref="FaceCount"/> and <see cref="Centroid"/> are denormalized and kept
/// consistent by the cluster services (incremental mean on assign, exact
/// recompute on cluster/merge/move).
/// </summary>
public sealed class Person
{
    public const int MaxNameLength = 200;

    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }

    /// <summary>Display name; null shows as "Unnamed" in the clients.</summary>
    public string? Name { get; set; }

    /// <summary>Best face of the cluster (highest det score × area); no FK to keep
    /// the persons ↔ photo_faces cycle constraint-free.</summary>
    public Guid? CoverFaceId { get; set; }

    public int FaceCount { get; set; }

    /// <summary>Normalized mean of the member embeddings (512-d); used for cheap
    /// incremental assignment. Null for an empty person.</summary>
    public float[]? Centroid { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static Person Create(Guid ownerId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        CreatedAt = now,
        UpdatedAt = now,
    };

    public void Touch(DateTimeOffset now) => UpdatedAt = now;

    public void Rename(string? name, DateTimeOffset now)
    {
        Name = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        Touch(now);
    }
}
