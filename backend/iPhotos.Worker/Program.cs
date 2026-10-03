using iPhotos.Application.Common;
using iPhotos.Infrastructure;
using iPhotos.Worker;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<IDateTimeProvider, UtcDateTimeProvider>();
builder.Services.AddInfrastructure();
builder.Services.AddVariantProcessing();
builder.Services.AddZipImportProcessing();
builder.Services.AddBillingMaintenance();
builder.Services.AddHostedService<VariantProcessingWorker>();
builder.Services.AddHostedService<ZipImportWorker>();
builder.Services.AddHostedService<OrphanUploadSweeper>();
builder.Services.AddHostedService<BillingExpiryWorker>();

var host = builder.Build();
await host.Services.MigrateDatabaseAsync();
host.Run();
