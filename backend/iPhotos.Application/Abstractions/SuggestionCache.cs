using iPhotos.Application.Common;

namespace iPhotos.Application.Abstractions;

/// <summary>Per-owner memo of computed suggestion queues (doc 18 §7.4): the
/// pass costs a faces-with-embeddings load plus O(faces×people) scoring, and
/// clients refetch on every screen focus — so results are cached against the
/// cheap <see cref="SuggestionStamp"/> signature and mutations invalidate
/// naturally by moving it.</summary>
public interface ISuggestionCache
{
    /// <summary>The cached queues for the owner, but only when the signature
    /// matches and the entry is still fresh; null otherwise.</summary>
    PersonSuggestionsDto? TryGet(Guid ownerId, string signature);

    void Set(Guid ownerId, string signature, PersonSuggestionsDto suggestions);
}
