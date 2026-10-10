using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Infrastructure.Persistence;
using iPhotos.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Pgvector.EntityFrameworkCore;

namespace iPhotos.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddOptions<BlobStorageOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(BlobStorageOptions.SectionName).Bind(options));
        services.AddOptions<HttpBlobStorageOptions>().Configure<IConfiguration>(
            (options, configuration) => configuration.GetSection(HttpBlobStorageOptions.SectionName).Bind(options));

        // Connection string resolved from the final IConfiguration (late binding keeps
        // WebApplicationFactory overrides effective).
        services.AddDbContext<PhotosDbContext>((sp, options) =>
        {
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Database")
                ?? throw new InvalidOperationException("ConnectionStrings:Database is missing.");
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(PhotosDbContext).Assembly.FullName);
                npgsql.UseVector(); // pgvector type mappings (face embeddings, D22)
            });
            options.UseSnakeCaseNamingConvention();
        });

        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();
        services.AddScoped<IPhotoRepository, PhotoRepository>();
        services.AddScoped<IVariantRepository, VariantRepository>();
        services.AddScoped<IVariantJobRepository, VariantJobRepository>();
        services.AddScoped<IZipImportRepository, ZipImportRepository>();
        services.AddScoped<IBillingPurchaseRepository, BillingPurchaseRepository>();
        services.AddScoped<IPersonRepository, PersonRepository>();
        services.AddScoped<IFaceRepository, FaceRepository>();
        services.AddScoped<IFaceReviewRepository, FaceReviewRepository>();
        services.AddScoped<IPhotoLabelRepository, PhotoLabelRepository>();
        services.AddScoped<IMlJobRepository, MlJobRepository>();
        // Blob storage backend is picked at resolution time (late binding keeps
        // WebApplicationFactory overrides effective): local filesystem by default,
        // or the standalone storage service when BlobStorage:Mode is 'Http'.
        services.AddSingleton<IBlobStorage>(sp =>
        {
            var blob = sp.GetRequiredService<IOptions<BlobStorageOptions>>().Value;
            if (!string.Equals(blob.Mode, "Http", StringComparison.OrdinalIgnoreCase))
            {
                return new FilesystemBlobStorage(Options.Create(blob));
            }

            var storageService = sp.GetRequiredService<IOptions<HttpBlobStorageOptions>>().Value;
            return new HttpBlobStorage(storageService);
        });

        // Zip-import staging ("staging" key): zip archives park here between upload and
        // processing, so StorageService:StagingProvider points at a local-disk provider
        // (compose uses the storage host's 'filesystem' provider) and the raw archive
        // never round-trips through the remote blob target. Only photos uploaded by the
        // import go to the main provider. Unset provider (or filesystem blob mode)
        // aliases the main backend, keeping single-node/dev setups unchanged.
        services.AddKeyedSingleton<IBlobStorage>("staging", (sp, _) =>
        {
            var blob = sp.GetRequiredService<IOptions<BlobStorageOptions>>().Value;
            var storageService = sp.GetRequiredService<IOptions<HttpBlobStorageOptions>>().Value;
            if (string.IsNullOrWhiteSpace(storageService.StagingProvider)
                || !string.Equals(blob.Mode, "Http", StringComparison.OrdinalIgnoreCase))
            {
                return sp.GetRequiredService<IBlobStorage>();
            }

            return new HttpBlobStorage(storageService.ForProvider(storageService.StagingProvider));
        });

        return services;
    }

    /// <summary>Applies pending EF Core migrations at startup (idempotent).</summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PhotosDbContext>();
        await db.Database.MigrateAsync(cancellationToken);
    }
}
