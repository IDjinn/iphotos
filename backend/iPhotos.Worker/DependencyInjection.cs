using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Domain;
using iPhotos.Imaging;
using iPhotos.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the variant processing pipeline (storage-saver application + EXIF
    /// indexing + preview/thumbnail generation). Used by the Worker host and by
    /// integration test hosts.
    /// </summary>
    public static IServiceCollection AddVariantProcessing(this IServiceCollection services)
    {
        services.AddOptions<WorkerOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(WorkerOptions.SectionName).Bind(options));
        services.AddOptions<OrphanSweepOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(OrphanSweepOptions.SectionName).Bind(options));
        services.AddOptions<ImagingOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(ImagingOptions.SectionName).Bind(options));
        services.AddOptions<VideoProcessorOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(VideoProcessorOptions.SectionName).Bind(options));
        services.AddOptions<UploadOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(UploadOptions.SectionName).Bind(options));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<ImagingOptions>>().Value);
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<VideoProcessorOptions>>().Value);

        services.AddSingleton<IImageVariantGenerator, ImageSharpVariantGenerator>();
        services.AddSingleton<IExifExtractor, ImageSharpExifExtractor>();
        services.AddSingleton<IVideoProcessor, FfmpegVideoProcessor>();
        services.AddSingleton<IImageCompressor, ImageSharpImageCompressor>();
        services.AddSingleton<IVideoCompressor, FfmpegVideoCompressor>();
        services.AddSingleton<IContentHasher, Sha256ContentHasher>();
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
        services.AddOptions<ZipImportCleanupOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(ZipImportCleanupOptions.SectionName).Bind(options));

        services.AddSingleton<IHeifConverter, MagickHeifConverter>();
        services.AddSingleton<IContentHasher, Sha256ContentHasher>();
        services.AddScoped<PhotoService>();
        services.AddScoped<ZipImportHandler>();
        services.AddScoped<ZipImportCleanupService>();
        return services;
    }

    /// <summary>
    /// Registers the AI pipelines (doc 18): face inference via the self-hosted ml
    /// container, scene labeling via an OpenAI-compatible vision endpoint, the three
    /// ml_jobs workers and the startup/backfill sweeper. Used by the Worker host.
    /// </summary>
    public static IServiceCollection AddAiProcessing(this IServiceCollection services)
    {
        services.AddOptions<AiOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(AiOptions.SectionName).Bind(options));
        services.AddOptions<MlOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(MlOptions.SectionName).Bind(options));
        services.AddOptions<VisionOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(VisionOptions.SectionName).Bind(options));

        services.AddHttpClient<IFaceInferenceProvider, HttpMlFaceProvider>((sp, client) =>
        {
            var ml = sp.GetRequiredService<IOptions<MlOptions>>().Value;
            client.BaseAddress = new Uri(EnsureTrailingSlash(ml.BaseUrl), UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(Math.Max(5, ml.TimeoutSeconds));
        });
        services.AddHttpClient<IVisionLabeler, OpenAiCompatibleVisionLabeler>((sp, client) =>
        {
            var vision = sp.GetRequiredService<IOptions<VisionOptions>>().Value;
            // Label jobs carry their own generous budget; the HTTP timeout only bounds
            // a hung VLM request.
            client.BaseAddress = new Uri(EnsureTrailingSlash(vision.BaseUrl), UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(Math.Max(10, vision.TimeoutSeconds));
        });

        services.AddSingleton<IFaceClusterer, ChineseWhispersClusterer>();
        services.AddSingleton<IFaceCropper, ImageSharpFaceCropper>();
        services.AddSingleton<IMlInputCache, DiskMlInputCache>();
        // The ML workers resolve the handler for a job's kind (doc 18 §6.2).
        services.AddKeyedScoped<IMlJobHandler, FaceProcessingService>(MlJobKind.Faces);
        services.AddKeyedScoped<IMlJobHandler, PersonClusterJobService>(MlJobKind.Cluster);
        services.AddKeyedScoped<IMlJobHandler, LabelProcessingService>(MlJobKind.Labels);
        services.AddScoped<MlJobEnqueuer>();
        return services;
    }

    /// <summary>
    /// Registers one ml_jobs worker per job kind + the startup/backfill sweeper.
    /// Caller provides IOptions&lt;WorkerOptions&gt; and the PostgresQueueListener.
    /// These MUST be plain AddSingleton&lt;IHostedService&gt; registrations —
    /// AddHostedService dedupes through TryAddEnumerable on the implementation
    /// type, and all three workers share the MlJobWorker type, so only the first
    /// registration ever started and Cluster/Labels jobs sat queued forever
    /// (the worker-registration tests pin this).
    /// </summary>
    public static IServiceCollection AddMlJobWorkers(this IServiceCollection services)
    {
        services.AddSingleton<IHostedService>(sp => new MlJobWorker(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<PostgresQueueListener>(),
            sp.GetRequiredService<IOptions<WorkerOptions>>(),
            MlJobKind.Faces,
            sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlFaceLaneConcurrency,
            TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlFaceJobTimeoutMinutes)),
            sp.GetRequiredService<ILogger<MlJobWorker>>()));
        services.AddSingleton<IHostedService>(sp => new MlJobWorker(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<PostgresQueueListener>(),
            sp.GetRequiredService<IOptions<WorkerOptions>>(),
            MlJobKind.Cluster,
            sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlClusterLaneConcurrency,
            TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlClusterJobTimeoutMinutes)),
            sp.GetRequiredService<ILogger<MlJobWorker>>()));
        services.AddSingleton<IHostedService>(sp => new MlJobWorker(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<PostgresQueueListener>(),
            sp.GetRequiredService<IOptions<WorkerOptions>>(),
            MlJobKind.Labels,
            sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlLabelLaneConcurrency,
            TimeSpan.FromMinutes(Math.Max(1, sp.GetRequiredService<IOptions<WorkerOptions>>().Value.MlLabelJobTimeoutMinutes)),
            sp.GetRequiredService<ILogger<MlJobWorker>>()));
        services.AddHostedService<MlBackfillSweeper>();
        return services;
    }

    private static string EnsureTrailingSlash(string baseUrl) =>
        string.IsNullOrWhiteSpace(baseUrl) ? "http://invalid/" : baseUrl.TrimEnd('/') + "/";

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
