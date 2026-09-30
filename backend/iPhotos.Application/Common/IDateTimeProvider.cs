namespace iPhotos.Application.Common;

/// <summary>
/// Single source of time for the whole system. Every timestamp is UTC
/// (DateTimeOffset with zero offset), persisted as timestamptz in PostgreSQL.
/// </summary>
public interface IDateTimeProvider
{
    DateTimeOffset UtcNow { get; }
}

public sealed class UtcDateTimeProvider : IDateTimeProvider
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
