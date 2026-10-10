using System.Numerics.Tensors;
using iPhotos.Domain;

namespace iPhotos.Application.Abstractions;

/// <summary>
/// Face inference seam (doc 18, D20). The default implementation calls the
/// self-hosted ml container (embeddings mode); cloud adapters (Rekognition,
/// Azure Face…) plug in later — they operate in face-index mode and are
/// responsible for their own clustering semantics.
/// </summary>
public interface IFaceInferenceProvider
{
    /// <summary>Detects faces in the image and returns their bounding boxes (pixels of
    /// the received image), detection scores and unit-norm embeddings.</summary>
    Task<IReadOnlyList<DetectedFace>> DetectAsync(Stream image, CancellationToken cancellationToken = default);
}

public sealed record DetectedFace(float X, float Y, float Width, float Height, float DetScore, float[] Embedding);

/// <summary>
/// Scene-label seam (doc 18 §8, D21): any OpenAI-compatible vision endpoint.
/// Implementations must tolerate slow/loud backends — the label queue applies
/// its own retry budget.
/// </summary>
public interface IVisionLabeler
{
    /// <summary>Labels the image; scores are model confidences (0..1).</summary>
    Task<IReadOnlyList<LabelResult>> ClassifyAsync(Stream image, CancellationToken cancellationToken = default);
}

public sealed record LabelResult(string Name, float Score);

/// <summary>Crops the detected bbox out of the source image into a small square JPEG face crop.</summary>
public interface IFaceCropper
{
    Task<Stream> CropAsync(Stream image, float x, float y, float width, float height, int longEdge, CancellationToken cancellationToken = default);
}

/// <summary>Groups one owner's face embeddings into clusters (doc 18 §7.2). Pure
/// logic — the caller maps clusters to Person rows and preserves names.</summary>
public interface IFaceClusterer
{
    /// <summary>Assignments for every input face (cluster id per face index).</summary>
    IReadOnlyList<int> Cluster(IReadOnlyList<float[]> embeddings, float threshold);

    /// <summary>Normalized mean of unit-norm embeddings; null for an empty set.</summary>
    float[]? Centroid(IReadOnlyList<float[]> embeddings);
}

public sealed class ChineseWhispersClusterer(int maxIterations = 20) : IFaceClusterer
{
    public IReadOnlyList<int> Cluster(IReadOnlyList<float[]> embeddings, float threshold)
    {
        var count = embeddings.Count;
        var assignments = new int[count];
        if (count == 0)
        {
            return assignments;
        }

        if (count == 1)
        {
            assignments[0] = 0;
            return assignments;
        }

        // Graph edges: cosine similarity above the threshold (embeddings are unit-norm,
        // so cosine is a dot product). Computed once — Chinese Whispers reshuffles only
        // the labels.
        var neighbors = new List<int>[count];
        for (var i = 0; i < count; i++)
        {
            neighbors[i] = [];
        }

        for (var i = 0; i < count; i++)
        {
            for (var j = i + 1; j < count; j++)
            {
                if (TensorPrimitives.CosineSimilarity(embeddings[i], embeddings[j]) >= threshold)
                {
                    neighbors[i].Add(j);
                    neighbors[j].Add(i);
                }
            }
        }

        // Chinese Whispers: every node starts in its own cluster; each pass, a node
        // adopts the strongest neighboring label (ties broken randomly, weights 1).
        for (var i = 0; i < count; i++)
        {
            assignments[i] = i;
        }

        var random = new Random(20261009); // deterministic for tests/reproducibility
        for (var iteration = 0; iteration < maxIterations; iteration++)
        {
            var changed = false;
            for (var i = 0; i < count; i++)
            {
                if (neighbors[i].Count == 0)
                {
                    continue;
                }

                var weights = new Dictionary<int, double>();
                foreach (var neighbor in neighbors[i])
                {
                    var label = assignments[neighbor];
                    weights[label] = weights.GetValueOrDefault(label) + 1;
                }

                var best = weights.MaxBy(pair => pair.Value + random.NextDouble() * 1e-9).Key;
                if (best != assignments[i])
                {
                    assignments[i] = best;
                    changed = true;
                }
            }

            if (!changed)
            {
                break;
            }
        }

        // Compact labels to 0..k-1 (first-seen order keeps output stable).
        var remap = new Dictionary<int, int>();
        for (var i = 0; i < count; i++)
        {
            if (!remap.TryGetValue(assignments[i], out var compact))
            {
                compact = remap.Count;
                remap[assignments[i]] = compact;
            }

            assignments[i] = compact;
        }

        return assignments;
    }

    public float[]? Centroid(IReadOnlyList<float[]> embeddings)
    {
        if (embeddings.Count == 0)
        {
            return null;
        }

        var dims = embeddings[0].Length;
        var mean = new float[dims];
        foreach (var embedding in embeddings)
        {
            TensorPrimitives.Add(mean, embedding, mean);
        }

        TensorPrimitives.Divide(mean, embeddings.Count, mean);
        var norm = TensorPrimitives.Norm(mean);
        if (norm <= 0f)
        {
            return mean;
        }

        TensorPrimitives.Divide(mean, norm, mean);
        return mean;
    }
}
