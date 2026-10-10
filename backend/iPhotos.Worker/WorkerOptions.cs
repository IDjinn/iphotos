namespace iPhotos.Worker;

public sealed class WorkerOptions
{
    public const string SectionName = "Worker";

    /// <summary>Seconds to wait after a failed loop iteration before retrying.</summary>
    public double PollIntervalSeconds { get; set; } = 1;

    /// <summary>
    /// Fallback idle wait when the queue is empty. LISTEN/NOTIFY wakes the workers
    /// instantly, so this only bounds the worst-case delay for missed notifications
    /// (e.g. while the listener reconnects). A job enqueued while the worker was down
    /// is picked up by the first iteration regardless.
    /// </summary>
    public double IdlePollSeconds { get; set; } = 30;

    /// <summary>Parallel fast lanes reserved for photo jobs (EXIF + previews are cheap).</summary>
    public int PhotoLaneConcurrency { get; set; } = 8;

    /// <summary>Parallel slow lanes for video jobs (ffmpeg transcoding is expensive and
    /// single-shot); kept low so videos cannot starve the photo lanes' CPU.</summary>
    public int VideoLaneConcurrency { get; set; } = 2;

    /// <summary>Hard wall-clock budget per photo job. A job exceeding it fails (and
    /// retries) instead of holding its lane forever.</summary>
    public int PhotoJobTimeoutMinutes { get; set; } = 10;

    /// <summary>Hard wall-clock budget per video job (large originals + transcode).</summary>
    public int VideoJobTimeoutMinutes { get; set; } = 60;

    // ── AI pipelines (doc 18) ────────────────────────────────────────────────

    /// <summary>Parallel lanes for faces jobs (one inference + crop round-trip each).</summary>
    public int MlFaceLaneConcurrency { get; set; } = 2;

    /// <summary>Hard wall-clock budget per faces job (detect + N crops + uploads).</summary>
    public int MlFaceJobTimeoutMinutes { get; set; } = 2;

    /// <summary>Parallel lanes for labels jobs; local VLMs are slow, so this stays at 1.</summary>
    public int MlLabelLaneConcurrency { get; set; } = 1;

    /// <summary>Hard wall-clock budget per labels job (local VLMs can take a while).</summary>
    public int MlLabelJobTimeoutMinutes { get; set; } = 10;

    /// <summary>Parallel lanes for reclustering jobs; keep at 1 — one pass per owner at a time.</summary>
    public int MlClusterLaneConcurrency { get; set; } = 1;

    /// <summary>Hard wall-clock budget per reclustering job (full owner face scan).</summary>
    public int MlClusterJobTimeoutMinutes { get; set; } = 15;

    /// <summary>Hours between backfill sweeps (startup recovery runs on every boot).</summary>
    public double MlBackfillIntervalHours { get; set; } = 6;

    /// <summary>Ready photos examined per backfill pass (per pipeline).</summary>
    public int MlBackfillBatchSize { get; set; } = 500;
}

public sealed class OrphanSweepOptions
{
    public const string SectionName = "OrphanSweep";

    /// <summary>Minutes between orphan-upload sweeps.</summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>Age a PendingUpload photo must reach before its row and blob are deleted.</summary>
    public int MaxAgeHours { get; set; } = 24;
}
