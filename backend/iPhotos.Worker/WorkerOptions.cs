namespace iPhotos.Worker;

public sealed class WorkerOptions
{
    public const string SectionName = "Worker";

    /// <summary>Seconds to wait between queue polls when idle; fractions allowed.</summary>
    public double PollIntervalSeconds { get; set; } = 1;
}

public sealed class OrphanSweepOptions
{
    public const string SectionName = "OrphanSweep";

    /// <summary>Minutes between orphan-upload sweeps.</summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>Age a PendingUpload photo must reach before its row and blob are deleted.</summary>
    public int MaxAgeHours { get; set; } = 24;
}
