using iPhotos.Application.Common;
using iPhotos.Domain;
using iPhotos.Infrastructure;
using iPhotos.Worker;
using Microsoft.Extensions.Options;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<IDateTimeProvider, UtcDateTimeProvider>();
builder.Services.AddInfrastructure();
builder.Services.AddVariantProcessing();
builder.Services.AddZipImportProcessing();
builder.Services.AddBillingMaintenance();
builder.Services.AddAiProcessing();
builder.Services.AddHostedService<VariantProcessingWorker>();
builder.Services.AddHostedService<ZipImportWorker>();
builder.Services.AddHostedService<OrphanUploadSweeper>();
builder.Services.AddHostedService<BillingExpiryWorker>();
builder.Services.AddSingleton<PostgresQueueListener>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PostgresQueueListener>());
// AI pipelines (doc 18): one MlJobWorker per job kind + backfill/recovery sweeper.
builder.Services.AddHostedService(sp => new MlJobWorker(
    sp.GetRequiredService<IServiceScopeFactory>(),
    sp.GetRequiredService<PostgresQueueListener>(),
    sp.GetRequiredService<IOptions<WorkerOptions>>(),
    MlJobKind.Faces,
    sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlFaceLaneConcurrency,
    TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlFaceJobTimeoutMinutes)),
    sp.GetRequiredService<ILoggerFactory>().CreateLogger("iPhotos.Worker.MlJobWorker.Faces")));
builder.Services.AddHostedService(sp => new MlJobWorker(
    sp.GetRequiredService<IServiceScopeFactory>(),
    sp.GetRequiredService<PostgresQueueListener>(),
    sp.GetRequiredService<IOptions<WorkerOptions>>(),
    MlJobKind.Cluster,
    sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlClusterLaneConcurrency,
    TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlClusterJobTimeoutMinutes)),
    sp.GetRequiredService<ILoggerFactory>().CreateLogger("iPhotos.Worker.MlJobWorker.Cluster")));
builder.Services.AddHostedService(sp => new MlJobWorker(
    sp.GetRequiredService<IServiceScopeFactory>(),
    sp.GetRequiredService<PostgresQueueListener>(),
    sp.GetRequiredService<IOptions<WorkerOptions>>(),
    MlJobKind.Labels,
    sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlLabelLaneConcurrency,
    TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlLabelJobTimeoutMinutes)),
    sp.GetRequiredService<ILoggerFactory>().CreateLogger("iPhotos.Worker.MlJobWorker.Labels")));
builder.Services.AddHostedService<MlBackfillSweeper>();

var host = builder.Build();
await host.Services.MigrateDatabaseAsync();
host.Run();
