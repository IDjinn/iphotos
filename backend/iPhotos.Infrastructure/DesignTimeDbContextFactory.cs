using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace iPhotos.Infrastructure;

/// <summary>
/// Lets `dotnet ef` create the DbContext at design time (migrations) without a running host.
/// Connection string comes from the IPHOTOS_DATABASE environment variable.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<PhotosDbContext>
{
    private const string DefaultConnectionString =
        "Host=localhost;Port=5432;Database=iphotos;Username=iphotos;Password=iphotos";

    public PhotosDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("IPHOTOS_DATABASE") ?? DefaultConnectionString;

        var options = new DbContextOptionsBuilder<PhotosDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new PhotosDbContext(options);
    }
}
