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
// AI pipelines (doc 18): one MlJobWorker per job kind + backfill/recovery sweeper.
builder.Services.AddMlJobWorkers();
builder.Services.AddHostedService<VariantProcessingWorker>();
builder.Services.AddHostedService<ZipImportWorker>();
builder.Services.AddHostedService<ZipImportCleanupWorker>();
builder.Services.AddHostedService<OrphanUploadSweeper>();
builder.Services.AddHostedService<BillingExpiryWorker>();
builder.Services.AddSingleton<PostgresQueueListener>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PostgresQueueListener>());

var host = builder.Build();
await host.Services.MigrateDatabaseAsync();
host.Run();
