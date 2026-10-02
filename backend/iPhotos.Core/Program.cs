using System.Text;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Auth;
using iPhotos.Core.Endpoints;
using iPhotos.Core.Middleware;
using iPhotos.Imaging;
using iPhotos.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

builder.Services.AddSingleton<IDateTimeProvider, UtcDateTimeProvider>();
builder.Services.AddSingleton<IContentHasher, Sha256ContentHasher>();

// Options are bound lazily (resolved from the final IConfiguration) so test hosts
// created via WebApplicationFactory can override appsettings after Program starts.
builder.Services.AddOptions<JwtOptions>().Configure<IConfiguration>((o, c) => c.GetSection(JwtOptions.SectionName).Bind(o));
builder.Services.AddOptions<StorageOptions>().Configure<IConfiguration>((o, c) => c.GetSection(StorageOptions.SectionName).Bind(o));
builder.Services.AddOptions<ImagingOptions>().Configure<IConfiguration>((o, c) => c.GetSection(ImagingOptions.SectionName).Bind(o));
builder.Services.AddOptions<Argon2HasherOptions>().Configure<IConfiguration>((o, c) => c.GetSection(Argon2HasherOptions.SectionName).Bind(o));
builder.Services.AddOptions<ZipImportOptions>().Configure<IConfiguration>((o, c) => c.GetSection(ZipImportOptions.SectionName).Bind(o));

builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<JwtOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<Argon2HasherOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<ImagingOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<StorageOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<ZipImportOptions>>().Value);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .PostConfigure<IServiceProvider>((options, sp) =>
    {
        var jwt = sp.GetRequiredService<IOptions<JwtOptions>>().Value;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddInfrastructure();

builder.Services.AddSingleton<IPasswordHasher, Argon2PasswordHasher>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();
builder.Services.AddSingleton<IHeifConverter, MagickHeifConverter>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<PhotoService>();
builder.Services.AddScoped<ZipImportHandler>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimiting:AuthPermitLimit", 20),
            Window = TimeSpan.FromMinutes(1),
        }));
});

// Uploads: allow photos up to ~200 MB.
builder.Services.Configure<FormOptions>(options =>
    options.MultipartBodyLengthLimit = 200L * 1024 * 1024);
builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = 200L * 1024 * 1024);

var app = builder.Build();

app.UseMiddleware<ExceptionMappingMiddleware>();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapAuthEndpoints();
app.MapPhotoEndpoints();
app.MapImportEndpoints();
app.MapGet("/health", () => Results.Ok(new { status = "ok", utcNow = DateTimeOffset.UtcNow }));

await app.Services.MigrateDatabaseAsync();

app.Run();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;

