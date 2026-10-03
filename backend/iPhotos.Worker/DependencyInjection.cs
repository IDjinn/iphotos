using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Imaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the variant processing pipeline (EXIF indexing + preview/thumbnail
    /// generation). Used by the Worker host and by integration test hosts.
    /// </summary>
    public static IServiceCollection AddVariantProcessing(this IServiceCollection services)
    {
        services.AddOptions<WorkerOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(WorkerOptions.SectionName).Bind(options));
        services.AddOptions<OrphanSweepOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(OrphanSweepOptions.SectionName).Bind(options));
        services.AddOptions<ImagingOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(ImagingOptions.SectionName).Bind(options));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<ImagingOptions>>().Value);

        services.AddSingleton<IImageVariantGenerator, ImageSharpVariantGenerator>();
        services.AddSingleton<IExifExtractor, ImageSharpExifExtractor>();
        services.AddScoped<VariantProcessingHandler>();
        return services;
    }

    /// <summary>
    /// Registers the zip import pipeline (archive extraction + HEIC transcode + photo
    /// ingestion). The handler ingests through PhotoService, so its dependencies
    /// (content hasher included) are registered here as well.
    /// </summary>
    public static IServiceCollection AddZipImportProcessing(this IServiceCollection services)
    {
        services.AddOptions<ZipImportOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(ZipImportOptions.SectionName).Bind(options));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<ZipImportOptions>>().Value);

        services.AddSingleton<IHeifConverter, MagickHeifConverter>();
        services.AddSingleton<IContentHasher, Sha256ContentHasher>();
        services.AddScoped<PhotoService>();
        services.AddScoped<ZipImportHandler>();
        return services;
    }

    /// <summary>
    /// Registers the billing expiry sweep (grace period handling + free-tier downgrade).
    /// </summary>
    public static IServiceCollection AddBillingMaintenance(this IServiceCollection services)
    {
        services.AddOptions<BillingOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(BillingOptions.SectionName).Bind(options));
        services.AddOptions<StorageOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(StorageOptions.SectionName).Bind(options));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<BillingOptions>>().Value);
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<StorageOptions>>().Value);

        services.AddScoped<BillingExpiryHandler>();
        return services;
    }
}
