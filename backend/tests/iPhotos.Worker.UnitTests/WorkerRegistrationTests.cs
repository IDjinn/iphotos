using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Domain;
using iPhotos.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker.UnitTests;

/// <summary>
/// Pins the worker host's DI wiring. The runtime errors these prevent are the
/// silent kind: AddHostedService once deduped the three same-typed MlJobWorker
/// registrations (only Faces ever started; Cluster/Labels queued forever), and
/// a missing keyed IMlJobHandler would crash every claimed job of that kind.
/// </summary>
public class WorkerRegistrationTests
{
    private static IServiceCollection NewServices()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Options.Create(new WorkerOptions()));
        services.AddSingleton(Options.Create(new AiOptions()));
        services.AddSingleton(new PostgresQueueListener(
            new ConfigurationBuilder()
                .AddInMemoryCollection(
                [new KeyValuePair<string, string?>("ConnectionStrings:Database", "Host=localhost")])
                .Build(),
            NullLogger<PostgresQueueListener>.Instance));
        return services;
    }

    [Fact]
    public void AddMlJobWorkers_RegistersOneWorkerPerKind_PlusSweeper()
    {
        var services = NewServices();
        services.AddMlJobWorkers();

        // TryAddEnumerable dedup (the AddHostedService trap) would collapse the
        // three same-typed MlJobWorker registrations into one — the count pins it.
        services.Count(d => d.ServiceType == typeof(IHostedService)).ShouldBe(4);
    }

    [Fact]
    public void AddMlJobWorkers_AllRegistrationsResolve()
    {
        var services = NewServices();
        services.AddMlJobWorkers();
        using var provider = services.BuildServiceProvider();

        var hosted = provider.GetServices<IHostedService>().ToList();
        hosted.Count.ShouldBe(4);
        hosted.OfType<MlJobWorker>().Count().ShouldBe(3);
    }

    [Fact]
    public void AddAiProcessing_RegistersKeyedHandler_ForEveryJobKind()
    {
        var services = new ServiceCollection();
        services.AddAiProcessing();

        foreach (var kind in Enum.GetValues<MlJobKind>())
        {
            services.Any(d =>
                    d.ServiceType == typeof(IMlJobHandler) &&
                    Equals(d.ServiceKey, kind))
                .ShouldBeTrue($"no keyed IMlJobHandler registered for kind '{kind}'");
        }
    }
}
