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
builder.Services.AddSingleton<IImageVariantGenerator, ImageSharpVariantGenerator>();
builder.Services.AddSingleton<IExifExtractor, ImageSharpExifExtractor>();

// Options are bound lazily (resolved from the final IConfiguration) so test hosts
// created via WebApplicationFactory can override appsettings after Program starts.
builder.Services.AddOptions<JwtOptions>().Configure<IConfiguration>((o, c) => c.GetSection(JwtOptions.SectionName).Bind(o));
builder.Services.AddOptions<StorageOptions>().Configure<IConfiguration>((o, c) => c.GetSection(StorageOptions.SectionName).Bind(o));
builder.Services.AddOptions<ImagingOptions>().Configure<IConfiguration>((o, c) => c.GetSection(ImagingOptions.SectionName).Bind(o));
builder.Services.AddOptions<VideoProcessorOptions>().Configure<IConfiguration>((o, c) => c.GetSection(VideoProcessorOptions.SectionName).Bind(o));
builder.Services.AddOptions<Argon2HasherOptions>().Configure<IConfiguration>((o, c) => c.GetSection(Argon2HasherOptions.SectionName).Bind(o));
builder.Services.AddOptions<ZipImportOptions>().Configure<IConfiguration>((o, c) => c.GetSection(ZipImportOptions.SectionName).Bind(o));
builder.Services.AddOptions<BillingOptions>().Configure<IConfiguration>((o, c) => c.GetSection(BillingOptions.SectionName).Bind(o));
builder.Services.AddOptions<TestBillingOptions>().Configure<IConfiguration>((o, c) => c.GetSection(TestBillingOptions.SectionName).Bind(o));
builder.Services.AddOptions<CorsSettings>().Configure<IConfiguration>((o, c) => c.GetSection(CorsSettings.SectionName).Bind(o));
builder.Services.AddOptions<UploadOptions>().Configure<IConfiguration>((o, c) => c.GetSection(UploadOptions.SectionName).Bind(o));

builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<JwtOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<Argon2HasherOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<ImagingOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<VideoProcessorOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<StorageOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<ZipImportOptions>>().Value);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<BillingOptions>>().Value);

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

// Browser clients (web app, desktop shell) reach the API only from configured origins;
// native apps are unaffected by CORS. Empty list = no cross-origin access. The policy
// delegate runs on first request, so late configuration overrides are honored.
builder.Services.AddCors(options => options.AddPolicy(CorsSettings.PolicyName, policy =>
{
    var origins = builder.Configuration.GetSection(CorsSettings.SectionName).Get<CorsSettings>()?.AllowedOrigins ?? [];
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
}));

builder.Services.AddInfrastructure();

builder.Services.AddSingleton<IPasswordHasher, Argon2PasswordHasher>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();
builder.Services.AddSingleton<IHeifConverter, MagickHeifConverter>();
builder.Services.AddSingleton<IVideoProcessor, FfmpegVideoProcessor>();
// Purchase verification provider is picked at resolution time (late binding, like the
// blob storage): "test" simulates purchases for dev/sandbox; real stores plug in here.
builder.Services.AddSingleton<IBillingProvider>(sp =>
{
    var billing = sp.GetRequiredService<IOptions<BillingOptions>>().Value;
    return billing.Provider?.ToLowerInvariant() switch
    {
        "test" => new TestBillingProvider(
            sp.GetRequiredService<IOptions<TestBillingOptions>>(),
            sp.GetRequiredService<IDateTimeProvider>()),
        _ => throw new InvalidOperationException($"Unknown billing provider '{billing.Provider}'."),
    };
});
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<PhotoService>();
builder.Services.AddScoped<UserPreferencesService>();
builder.Services.AddScoped<ZipImportHandler>();
builder.Services.AddScoped<BillingService>();

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

// Uploads: the request body cap follows the largest per-file cap in Upload:*
// (saver modes compress after the upload, so the body must admit the original
// bytes; a 0 cap means "unlimited").
var uploadLimits = builder.Configuration.GetSection(UploadOptions.SectionName).Get<UploadOptions>() ?? new UploadOptions();
var maxUploadBytes = new[]
{
    uploadLimits.FreeSaverMaxImageBytes, uploadLimits.FreeSaverMaxVideoBytes,
    uploadLimits.FreeOriginalMaxImageBytes, uploadLimits.FreeOriginalMaxVideoBytes,
    uploadLimits.PaidSaverMaxImageBytes, uploadLimits.PaidSaverMaxVideoBytes,
    uploadLimits.PaidOriginalMaxImageBytes, uploadLimits.PaidOriginalMaxVideoBytes,
}.Max();
if (maxUploadBytes <= 0)
{
    maxUploadBytes = long.MaxValue;
}
builder.Services.Configure<FormOptions>(options =>
    options.MultipartBodyLengthLimit = maxUploadBytes);
builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = maxUploadBytes);

var app = builder.Build();

app.UseMiddleware<ExceptionMappingMiddleware>();
app.UseCors(CorsSettings.PolicyName); // before rate limiting so preflight requests are never throttled
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
app.MapBillingEndpoints();
app.MapUserPreferenceEndpoints();
app.MapGet("/health", () => Results.Ok(new { status = "ok", utcNow = DateTimeOffset.UtcNow }));

await app.Services.MigrateDatabaseAsync();

app.Run();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;

