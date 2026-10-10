namespace iPhotos.Domain;

public sealed class ZipImportJob
{
    public const int DefaultMaxAttempts = 3;

    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public JobState State { get; set; }
    public int Attempts { get; set; }
    public int MaxAttempts { get; set; } = DefaultMaxAttempts;
    public string? LastError { get; set; }

    public int TotalEntries { get; set; }
    public int ProcessedEntries { get; set; }
    public int Imported { get; set; }
    public int Duplicated { get; set; }

    /// <summary>Video entries ingested by the import (subset of Imported).</summary>
    public int VideosImported { get; set; }

    public int Ignored { get; set; }
    public int Failed { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }

    public static ZipImportJob Create(
        Guid ownerId, string fileName, long sizeBytes, string blobPath, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        FileName = fileName,
        SizeBytes = sizeBytes,
        BlobPath = blobPath,
        State = JobState.Queued,
        MaxAttempts = DefaultMaxAttempts,
        CreatedAt = now,
    };

    /// <summary>
    /// Creates a job for an archive whose bytes are still arriving. The row exists
    /// from the first streamed byte so a page reload during a multi-gigabyte
    /// upload still shows it (state Uploading).
    /// </summary>
    public static ZipImportJob CreateUploading(
        Guid ownerId, string fileName, string blobPath, DateTimeOffset now, long? sizeBytes = null) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        FileName = fileName,
        SizeBytes = sizeBytes ?? 0,
        BlobPath = blobPath,
        State = JobState.Uploading,
        MaxAttempts = DefaultMaxAttempts,
        CreatedAt = now,
    };

    /// <summary>The archive finished staging; the worker may pick it up.</summary>
    public void MarkQueued(long sizeBytes, DateTimeOffset now)
    {
        if (State != JobState.Uploading)
        {
            throw new InvalidOperationException($"Cannot queue a job in state {State}.");
        }

        SizeBytes = sizeBytes;
        State = JobState.Queued;
    }

    /// <summary>
    /// The upload never finished (client disconnected or was rejected mid-stream):
    /// a worker retry makes no sense, so the job goes straight to Failed.
    /// </summary>
    public void FailUpload(string error, DateTimeOffset now)
    {
        if (State != JobState.Uploading)
        {
            throw new InvalidOperationException($"Cannot fail an upload in state {State}.");
        }

        LastError = error;
        State = JobState.Failed;
        ProcessedAt = now;
    }

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

    /// <summary>
    /// Permanent failure on the first occurrence (quota exhausted, encrypted archive):
    /// a retry would hit the same wall, so the job goes straight to Failed.
    /// </summary>
    public void FailPermanently(string error, DateTimeOffset now)
    {
        if (State != JobState.Processing)
        {
            throw new InvalidOperationException($"Cannot fail a job in state {State}.");
        }

        Attempts = MaxAttempts;
        LastError = error;
        State = JobState.Failed;
        ProcessedAt = now;
    }
}
