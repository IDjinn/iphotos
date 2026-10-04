using System.Threading.Channels;
using Npgsql;

namespace iPhotos.Worker;

/// <summary>
/// Wakes the queue workers the moment a job is enqueued: Postgres fires
/// pg_notify('iphotos_jobs_queued') from AFTER INSERT triggers (migration
/// AddPhotoMetadataAndQueueNotifications) and this hosted service LISTENs on the
/// channel, broadcasting to worker subscriptions. Notifications are fire-and-forget —
/// events emitted while the listener is disconnected are lost, so subscribers keep a
/// slow fallback wait (WorkerOptions.IdlePollSeconds) instead of a hot poll.
/// </summary>
public sealed class PostgresQueueListener(
    IConfiguration configuration,
    ILogger<PostgresQueueListener> logger) : BackgroundService
{
    public const string ChannelName = "iphotos_jobs_queued";

    private readonly string _connectionString = configuration.GetConnectionString("Database")
        ?? throw new InvalidOperationException("ConnectionStrings:Database is not configured.");

    private readonly object _subscribersGate = new();
    private readonly List<Channel<object?>> _subscribers = [];

    /// <summary>Registers a wake-up subscription; dispose it when the worker stops.</summary>
    public QueueWakeSubscription Subscribe()
    {
        var channel = Channel.CreateUnbounded<object?>(new UnboundedChannelOptions { SingleReader = true });
        lock (_subscribersGate)
        {
            _subscribers.Add(channel);
        }

        return new QueueWakeSubscription(this, channel);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var connection = new NpgsqlConnection(_connectionString);
                connection.Notification += (_, _) => Broadcast();
                await connection.OpenAsync(stoppingToken);
                await using (var listen = new NpgsqlCommand($"LISTEN {ChannelName}", connection))
                {
                    await listen.ExecuteNonQueryAsync(stoppingToken);
                }

                logger.LogInformation("Queue listener connected (channel {Channel})", ChannelName);

                // WaitAsync returns once per received notification and throws when the
                // connection drops — both paths are handled by this loop.
                while (!stoppingToken.IsCancellationRequested)
                {
                    await connection.WaitAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Queue listener disconnected; reconnecting in 5s");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        logger.LogInformation("Queue listener stopped");
    }

    private void Broadcast()
    {
        lock (_subscribersGate)
        {
            foreach (var subscriber in _subscribers)
            {
                subscriber.Writer.TryWrite(null);
            }
        }
    }

    private void Unsubscribe(Channel<object?> channel)
    {
        lock (_subscribersGate)
        {
            _subscribers.Remove(channel);
        }

        channel.Writer.TryComplete();
    }

    public sealed class QueueWakeSubscription : IDisposable
    {
        private readonly PostgresQueueListener _owner;
        private readonly Channel<object?> _channel;

        public QueueWakeSubscription(PostgresQueueListener owner, Channel<object?> channel)
        {
            _owner = owner;
            _channel = channel;
        }

        /// <summary>Waits until a queue notification arrives, or at most <paramref name="fallback"/>
        /// (the bounded worst case for missed notifications, e.g. while reconnecting).</summary>
        public async ValueTask WaitAsync(TimeSpan fallback, CancellationToken cancellationToken)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(fallback);
            try
            {
                await _channel.Reader.ReadAsync(timeout.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                // Fallback tick: no notification arrived within the wait window.
            }
            catch (ChannelClosedException)
            {
                // Listener is shutting down; treat as a plain fallback tick.
            }
        }

        public void Dispose() => _owner.Unsubscribe(_channel);
    }
}
