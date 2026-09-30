using iPhotos.Domain;

namespace iPhotos.Domain.UnitTests;

public class VariantJobTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_StartsQueued_WithZeroAttempts()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);

        job.Id.ShouldNotBe(Guid.Empty);
        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(0);
        job.MaxAttempts.ShouldBe(3);
        job.CreatedAt.ShouldBe(Now);
    }

    [Fact]
    public void Start_FromQueued_MoveToProcessing()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);

        job.Start();

        job.State.ShouldBe(JobState.Processing);
    }

    [Fact]
    public void Start_FromProcessing_Throws()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);
        job.Start();

        Should.Throw<InvalidOperationException>(job.Start);
    }

    [Fact]
    public void Complete_FromProcessing_MarksDone()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);
        job.Start();

        job.Complete(Now.AddSeconds(10));

        job.State.ShouldBe(JobState.Done);
        job.ProcessedAt.ShouldBe(Now.AddSeconds(10));
    }

    [Fact]
    public void Fail_BelowMaxAttempts_RequeuesForRetry()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);
        job.Start();

        var willRetry = job.Fail("transient", Now);

        willRetry.ShouldBeTrue();
        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(1);
        job.LastError.ShouldBe("transient");
    }

    [Fact]
    public void Fail_AtMaxAttempts_MarksFailedPermanently()
    {
        var job = VariantJob.Create(Guid.NewGuid(), Now);
        job.Start();
        job.Fail("err 1", Now);
        job.Start();
        job.Fail("err 2", Now);
        job.Start();

        var willRetry = job.Fail("err 3", Now);

        willRetry.ShouldBeFalse();
        job.State.ShouldBe(JobState.Failed);
        job.Attempts.ShouldBe(3);
        job.LastError.ShouldBe("err 3");
        job.ProcessedAt.ShouldBe(Now);
    }
}
