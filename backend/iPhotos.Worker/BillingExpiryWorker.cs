using iPhotos.Application;
using iPhotos.Application.Services;
using Microsoft.Extensions.Options;

namespace iPhotos.Worker;

/// <summary>
/// Periodic billing sweep: expires purchases past their grace period and downgrades
/// users without any remaining active subscription back to the free plan/quota.
/// Photos are preserved — the free quota only gates new uploads again.
/// </summary>
public sealed class BillingExpiryWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<BillingOptions> options,
    ILogger<BillingExpiryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromHours(Math.Max(0.1, options.Value.SweepIntervalHours));
        logger.LogInformation(
            "Billing expiry worker started (sweep every {Hours}h, grace {Days}d)",
            interval.TotalHours, options.Value.GracePeriodDays);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Sweep immediately on startup: purchases can lapse while the host is down.
                await SweepAsync(stoppingToken);
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Billing expiry sweep failed; retrying after interval");
                try
                {
                    await Task.Delay(interval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        logger.LogInformation("Billing expiry worker stopped");
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<BillingExpiryHandler>();
        await handler.ExpireLapsedPurchasesAsync(cancellationToken);
    }
}
