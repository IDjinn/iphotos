using System.Collections.Concurrent;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;

namespace iPhotos.Application.Services;

/// <summary>In-memory <see cref="ISuggestionCache"/> — the API is a
/// single-instance deployment, so per-owner entries live for the process
/// lifetime. A max age bounds staleness if any mutation path ever misses the
/// stamp (defense in depth; the stamp is the real invalidation).</summary>
public sealed class InMemorySuggestionCache : ISuggestionCache
{
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<Guid, (string Signature, DateTimeOffset ComputedAt, PersonSuggestionsDto Suggestions)> entries = new();

    public PersonSuggestionsDto? TryGet(Guid ownerId, string signature)
    {
        if (!entries.TryGetValue(ownerId, out var entry)
            || entry.Signature != signature
            || DateTimeOffset.UtcNow - entry.ComputedAt > MaxAge)
        {
            return null;
        }

        return entry.Suggestions;
    }

    public void Set(Guid ownerId, string signature, PersonSuggestionsDto suggestions) =>
        entries[ownerId] = (signature, DateTimeOffset.UtcNow, suggestions);
}
