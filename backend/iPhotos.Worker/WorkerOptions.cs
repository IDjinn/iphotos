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
}

public sealed class OrphanSweepOptions
{
    public const string SectionName = "OrphanSweep";

    /// <summary>Minutes between orphan-upload sweeps.</summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>Age a PendingUpload photo must reach before its row and blob are deleted.</summary>
    public int MaxAgeHours { get; set; } = 24;
}
