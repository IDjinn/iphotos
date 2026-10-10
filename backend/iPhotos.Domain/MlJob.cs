namespace iPhotos.Domain;

public enum MlJobKind
{
    Faces,
    Labels,
    Cluster,
}

public enum MlJobState
{
    Queued,
    Processing,
    Done,
    Failed,
}

/// <summary>
/// Queue row for the AI pipelines (doc 18 §6): per-photo jobs (faces/labels)
/// and per-owner reclustering jobs (cluster, photo null). Mirrors VariantJob's
/// retry semantics; a pg_notify trigger wakes the workers on insert.
/// </summary>
public sealed class MlJob
{
    public const int DefaultMaxAttempts = 3;

    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }

    /// <summary>Null for cluster jobs (they scope by owner).</summary>
    public Guid? PhotoId { get; set; }
    public MlJobKind Kind { get; set; }
    public MlJobState State { get; set; }
    public int Attempts { get; set; }
    public int MaxAttempts { get; set; } = DefaultMaxAttempts;
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }

    public static MlJob Create(Guid ownerId, Guid? photoId, MlJobKind kind, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        PhotoId = photoId,
        Kind = kind,
        State = MlJobState.Queued,
        MaxAttempts = DefaultMaxAttempts,
        CreatedAt = now,
    };

    public void Start()
    {
        if (State != MlJobState.Queued)
        {
            throw new InvalidOperationException($"Cannot start a job in state {State}.");
        }

        State = MlJobState.Processing;
    }

    public void Complete(DateTimeOffset now)
    {
        if (State != MlJobState.Processing)
        {
            throw new InvalidOperationException($"Cannot complete a job in state {State}.");
        }

        State = MlJobState.Done;
        ProcessedAt = now;
    }

    /// <summary>Returns true when the job will be retried; false when it failed permanently.</summary>
    public bool Fail(string error, DateTimeOffset now)
    {
        if (State != MlJobState.Processing)
        {
            throw new InvalidOperationException($"Cannot fail a job in state {State}.");
        }

        Attempts++;
        LastError = error;
        if (Attempts >= MaxAttempts)
        {
            State = MlJobState.Failed;
            ProcessedAt = now;
            return false;
        }

        State = MlJobState.Queued;
        return true;
    }

    /// <summary>Permanent failure for known-hopeless jobs (e.g. pipeline disabled) — skips the retry budget.</summary>
    public void FailWithoutRetry(string error, DateTimeOffset now)
    {
        if (State != MlJobState.Processing)
        {
            throw new InvalidOperationException($"Cannot fail a job in state {State}.");
        }

        Attempts = MaxAttempts;
        LastError = error;
        State = MlJobState.Failed;
        ProcessedAt = now;
    }
}
