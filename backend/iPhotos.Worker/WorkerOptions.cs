namespace iPhotos.Worker;

public sealed class WorkerOptions
{
    public const string SectionName = "Worker";

    /// <summary>Seconds to wait between queue polls when idle.</summary>
    public int PollIntervalSeconds { get; set; } = 2;
}
