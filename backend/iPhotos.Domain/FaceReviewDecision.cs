namespace iPhotos.Domain;

/// <summary>Outcome of a per-face review against one person (doc 18 §7.4):
/// the face was explicitly judged from the one-by-one review.</summary>
public enum FaceReviewKind
{
    /// <summary>Never suggest this face to this person again.</summary>
    Rejected,

    /// <summary>Skip for now — the face comes back once the person gains faces
    /// (its embedding improved), mirrored from Google Photos' "Not now".</summary>
    Deferred,
}

/// <summary>A per-face review verdict recorded from the one-by-one stepper:
/// persists so a rejected face stops resurfacing for that person, and a deferred
/// one stays quiet until the person's embedding changes (FaceCount grows).
/// PersonFaceCount is the staleness marker, not a business rule.</summary>
public sealed class FaceReviewDecision
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid FaceId { get; set; }
    public Guid PersonId { get; set; }
    public FaceReviewKind Decision { get; set; }

    /// <summary>The person's FaceCount when the decision was made; a Deferred
    /// decision expires once the person's FaceCount exceeds this.</summary>
    public int PersonFaceCount { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public static FaceReviewDecision Create(
        Guid ownerId,
        Guid faceId,
        Guid personId,
        FaceReviewKind decision,
        int personFaceCount,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        FaceId = faceId,
        PersonId = personId,
        Decision = decision,
        PersonFaceCount = personFaceCount,
        CreatedAt = now,
    };
}
