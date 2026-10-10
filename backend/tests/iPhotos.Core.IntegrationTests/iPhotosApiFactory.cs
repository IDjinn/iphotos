using System.Text.Json;
using iPhotos.Worker;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace iPhotos.Core.IntegrationTests;

/// <summary>
/// Boots the full API (Program) against a throwaway PostgreSQL container, a temp blob
/// directory and cheap Argon2 parameters, with the real variant worker running in-process.
/// </summary>
public sealed class iPhotosApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("pgvector/pgvector:pg17")

        .Build();

    private string DatabaseName { get; } = "iphotos_api_" + Guid.NewGuid().ToString("N");

    public string BlobRoot { get; } = Path.Combine(Path.GetTempPath(), "iphotos-blobs-" + Guid.NewGuid().ToString("N"));

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        var admin = new NpgsqlConnectionStringBuilder(_postgres.GetConnectionString()) { Database = "postgres" };
        await using var connection = new NpgsqlConnection(admin.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"CREATE DATABASE \"{DatabaseName}\"";
        await command.ExecuteNonQueryAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var testConnectionString = new NpgsqlConnectionStringBuilder(_postgres.GetConnectionString())
        {
            Database = DatabaseName,
        }.ConnectionString;

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Database"] = testConnectionString,
            ["Auth:Jwt:SigningKey"] = "integration-test-signing-key-32-bytes!!",
            ["Auth:Argon2:TimeCost"] = "1",
            ["Auth:Argon2:MemoryCost"] = "1024",
            ["Auth:Argon2:Lanes"] = "2",
            ["RateLimiting:AuthPermitLimit"] = "1000",
            ["BlobStorage:RootPath"] = BlobRoot,
            ["Worker:PollIntervalSeconds"] = "1",
        }));

        // The real worker pipelines, so uploads become Ready and zip imports
        // complete without manual intervention. Billing maintenance registers the
        // expiry handler so tests can run the sweep the Worker host would run.
        builder.ConfigureTestServices(services =>
        {
            services.AddVariantProcessing();
            services.AddZipImportProcessing();
            services.AddBillingMaintenance();
            // The listener wakes the workers on enqueue (LISTEN/NOTIFY); workers keep
            // their fallback wait, so imports still complete if it cannot connect.
            services.AddSingleton<PostgresQueueListener>();
            services.AddHostedService(sp => sp.GetRequiredService<PostgresQueueListener>());
            services.AddHostedService<VariantProcessingWorker>();
            services.AddHostedService<ZipImportWorker>();
        });
        builder.ConfigureLogging(logging =>
        {
            logging.ClearProviders();
            logging.AddConsole();
            logging.SetMinimumLevel(LogLevel.Information);
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
        if (Directory.Exists(BlobRoot))
        {
            Directory.Delete(BlobRoot, recursive: true);
        }
    }

    Task IAsyncLifetime.DisposeAsync() => DisposeAsync().AsTask();
}

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };
}
