using iPhotos.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace iPhotos.Core.IntegrationTests;

/// <summary>Creates an isolated database (migrations applied) per test, inside the shared container.</summary>
public static class TestDatabase
{
    public static async Task<PhotosDbContext> CreateAsync(PostgresFixture fixture)
    {
        var databaseName = "test_" + Guid.NewGuid().ToString("N");
        await fixture.CreateDatabaseAsync(databaseName);

        var options = new DbContextOptionsBuilder<PhotosDbContext>()
            .UseNpgsql(fixture.ConnectionStringFor(databaseName))
            .UseSnakeCaseNamingConvention()
            .Options;

        var db = new PhotosDbContext(options);
        await db.Database.MigrateAsync();
        return db;
    }
}
