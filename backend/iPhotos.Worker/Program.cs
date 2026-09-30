using iPhotos.Application.Common;
using iPhotos.Infrastructure;
using iPhotos.Worker;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<IDateTimeProvider, UtcDateTimeProvider>();
builder.Services.AddInfrastructure();
builder.Services.AddVariantProcessing();
builder.Services.AddHostedService<VariantProcessingWorker>();

var host = builder.Build();
await host.Services.MigrateDatabaseAsync();
host.Run();
