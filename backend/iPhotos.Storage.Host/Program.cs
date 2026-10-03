using iPhotos.Storage;
using iPhotos.Storage.Host;
using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

// Options are bound lazily so WebApplicationFactory test hosts can override after start.
builder.Services.AddOptions<StorageServiceOptions>().Configure<IConfiguration>(
    (options, configuration) => configuration.GetSection(StorageServiceOptions.SectionName).Bind(options));
builder.Services.AddOptions<FileSystemProviderOptions>().Configure<IConfiguration>(
    (options, configuration) => configuration.GetSection(FileSystemProviderOptions.SectionName).Bind(options));
builder.Services.AddOptions<S3ProviderOptions>().Configure<IConfiguration>(
    (options, configuration) => configuration.GetSection(S3ProviderOptions.SectionName).Bind(options));
builder.Services.AddOptions<WebDavProviderOptions>().Configure<IConfiguration>(
    (options, configuration) => configuration.GetSection(WebDavProviderOptions.SectionName).Bind(options));
builder.Services.AddOptions<GoogleDriveProviderOptions>().Configure<IConfiguration>(
    (options, configuration) => configuration.GetSection(GoogleDriveProviderOptions.SectionName).Bind(options));

builder.Services.AddSingleton<HmacUrlSigner>(sp =>
    new HmacUrlSigner(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<StorageServiceOptions>>().Value.SigningKey));
builder.Services.AddSingleton<ObjectStoreFactory>(sp =>
{
    var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<StorageServiceOptions>>().Value;
    return ObjectStoreFactory.FromOptions(
        options,
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<FileSystemProviderOptions>>().Value,
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<S3ProviderOptions>>().Value,
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<WebDavProviderOptions>>().Value,
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<GoogleDriveProviderOptions>>().Value);
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IObjectStoreFactoryAccessor, RequestObjectStoreFactoryAccessor>();

builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = builder.Configuration
        .GetSection(StorageServiceOptions.SectionName)
        .Get<StorageServiceOptions>()?.MaxBodyBytes ?? 200L * 1024 * 1024);
builder.Services.Configure<FormOptions>(options =>
    options.MultipartBodyLengthLimit = builder.Configuration
        .GetSection(StorageServiceOptions.SectionName)
        .Get<StorageServiceOptions>()?.MaxBodyBytes ?? 200L * 1024 * 1024);

var app = builder.Build();

app.UseMiddleware<ExceptionMappingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", utcNow = DateTimeOffset.UtcNow }));

app.MapGet("/api/providers", (ObjectStoreFactory factory, Microsoft.Extensions.Options.IOptions<StorageServiceOptions> options) =>
{
    var configured = new List<object>();
    foreach (var id in ObjectStoreFactory.KnownProviderIds)
    {
        try
        {
            var store = factory.Resolve(id);
            configured.Add(new { id = store.Id, canPresign = store.CanPresign, isDefault = store.Id == options.Value.DefaultProvider });
        }
        catch (ProviderNotConfiguredException)
        {
            // Not configured — simply not listed.
        }
    }

    return Results.Ok(new { defaultProvider = options.Value.DefaultProvider, providers = configured });
});

app.MapObjectEndpoints();

// One-line summary of where content will live — the storage service is otherwise
// quiet, so this makes the active provider visible at a glance in the logs.
var providers = new List<string>();
foreach (var id in ObjectStoreFactory.KnownProviderIds)
{
    try
    {
        app.Services.GetRequiredService<ObjectStoreFactory>().Resolve(id);
        providers.Add(id);
    }
    catch (ProviderNotConfiguredException)
    {
        // Not configured — not active.
    }
}
app.Logger.LogInformation(
    "Storage host started — default provider: {Default}, active: {Providers}",
    app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<StorageServiceOptions>>().Value.DefaultProvider,
    string.Join(", ", providers));

app.Run();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
