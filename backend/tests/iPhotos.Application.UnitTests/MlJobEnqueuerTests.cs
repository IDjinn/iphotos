using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.UnitTests;

public class MlJobEnqueuerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static MlJobEnqueuer NewEnqueuer(
        InMemoryMlJobRepository repository,
        bool aiEnabled,
        bool visionConfigured)
    {
        var vision = new VisionOptions();
        if (visionConfigured)
        {
            vision.BaseUrl = "http://vision/v1";
            vision.Model = "test-vlm";
        }

        return new MlJobEnqueuer(
            repository,
            Microsoft.Extensions.Options.Options.Create(new AiOptions { Enabled = aiEnabled }),
            Microsoft.Extensions.Options.Options.Create(vision),
            NullLogger<MlJobEnqueuer>.Instance);
    }

    private static Photo NewPhoto(MediaType mediaType) => Photo.Create(
        Guid.NewGuid(), $"hash-{Guid.NewGuid():N}", "img.jpg", "image/jpeg", 1000, Now, mediaType);

    [Fact]
    public async Task Enabled_with_vision_enqueues_faces_and_labels()
    {
        var jobs = new InMemoryMlJobRepository();
        var photo = NewPhoto(MediaType.Photo);

        await NewEnqueuer(jobs, aiEnabled: true, visionConfigured: true)
            .EnqueueForReadyPhotoAsync(photo);

        jobs.Jobs.Select(j => j.Kind).ShouldBe([MlJobKind.Faces, MlJobKind.Labels]);
        jobs.Jobs.All(j => j.OwnerId == photo.OwnerId && j.PhotoId == photo.Id).ShouldBeTrue();
    }

    [Fact]
    public async Task Enabled_without_vision_enqueues_faces_only()
    {
        var jobs = new InMemoryMlJobRepository();

        await NewEnqueuer(jobs, aiEnabled: true, visionConfigured: false)
            .EnqueueForReadyPhotoAsync(NewPhoto(MediaType.Photo));

        jobs.Jobs.Select(j => j.Kind).ShouldBe([MlJobKind.Faces]);
    }

    [Fact]
    public async Task Disabled_enqueues_nothing()
    {
        var jobs = new InMemoryMlJobRepository();

        await NewEnqueuer(jobs, aiEnabled: false, visionConfigured: true)
            .EnqueueForReadyPhotoAsync(NewPhoto(MediaType.Photo));

        jobs.Jobs.ShouldBeEmpty();
    }

    [Fact]
    public async Task Videos_are_skipped()
    {
        var jobs = new InMemoryMlJobRepository();

        await NewEnqueuer(jobs, aiEnabled: true, visionConfigured: true)
            .EnqueueForReadyPhotoAsync(NewPhoto(MediaType.Video));

        jobs.Jobs.ShouldBeEmpty();
    }
}
