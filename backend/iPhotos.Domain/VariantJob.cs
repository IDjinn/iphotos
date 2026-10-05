namespace iPhotos.Domain;

public enum JobState
{
    Uploading,
    Queued,
    Processing,
    Done,
    Failed,
}

public sealed class VariantJob
{
    public const int DefaultMaxAttempts = 3;

    public Guid Id { get; set; }
    public Guid PhotoId { get; set; }
    public JobState State { get; set; }
    public int Attempts { get; set; }
    public int MaxAttempts { get; set; } = DefaultMaxAttempts;
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }

    public static VariantJob Create(Guid photoId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        PhotoId = photoId,
        State = JobState.Queued,
        MaxAttempts = DefaultMaxAttempts,
        CreatedAt = now,
    };

    public void Start()
    {
        if (State != JobState.Queued)
        {
            throw new InvalidOperationException($"Cannot start a job in state {State}.");
        }

        State = JobState.Processing;
    }

    public void Complete(DateTimeOffset now)
    {
        if (State != JobState.Processing)
        {
            throw new InvalidOperationException($"Cannot complete a job in state {State}.");
        }

        State = JobState.Done;
        ProcessedAt = now;
    }

    /// <summary>Returns true when the job will be retried; false when it failed permanently.</summary>
    public bool Fail(string error, DateTimeOffset now)
    {
        if (State != JobState.Processing)
        {
            throw new InvalidOperationException($"Cannot fail a job in state {State}.");
        }

        Attempts++;
        LastError = error;
        if (Attempts >= MaxAttempts)
        {
            State = JobState.Failed;
            ProcessedAt = now;
            return false;
        }

        State = JobState.Queued;
        return true;
    }
}
