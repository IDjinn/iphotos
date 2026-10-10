using System.Numerics.Tensors;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;

namespace iPhotos.Application.UnitTests;

public class ChineseWhispersClustererTests
{
    private readonly ChineseWhispersClusterer _clusterer = new();

    [Fact]
    public void Cluster_groups_identical_embeddings_together()
    {
        var face = UnitVector(0.9f, 0.1f, 0f);
        var assignments = _clusterer.Cluster([face, face[..], face[..], face[..]], 0.55f);

        assignments.Distinct().ShouldHaveSingleItem();
    }

    [Fact]
    public void Cluster_separates_distant_groups()
    {
        // Two tight groups pointing in very different directions.
        float[] A() => UnitVector(0.95f, 0.15f, 0.05f);
        float[] B() => UnitVector(0.05f, -0.2f, 0.95f);
        var embeddings = new List<float[]> { A(), A(), A(), B(), B(), B(), B() };

        var assignments = _clusterer.Cluster(embeddings, 0.55f);

        // Same cluster within a group, different across groups.
        assignments[0].ShouldBe(assignments[1]);
        assignments[1].ShouldBe(assignments[2]);
        assignments[3].ShouldBe(assignments[4]);
        assignments[0].ShouldNotBe(assignments[3]);
    }

    [Fact]
    public void Cluster_assigns_single_face_to_its_own_cluster()
    {
        var assignments = _clusterer.Cluster([UnitVector(1f, 0f, 0f)], 0.55f);
        assignments.ShouldHaveSingleItem();
    }

    [Fact]
    public void Cluster_handles_empty_input()
    {
        _clusterer.Cluster([], 0.55f).ShouldBeEmpty();
    }

    [Fact]
    public void Centroid_is_the_normalized_mean()
    {
        var a = UnitVector(1f, 0f, 0f);
        var b = UnitVector(0f, 1f, 0f);

        var centroid = _clusterer.Centroid([a, b]);

        centroid.ShouldNotBeNull();
        TensorPrimitives.Norm(centroid).ShouldBe(1f, 0.001f);
        // Mean of two orthogonal unit vectors has cosine ≈ 0.707 with both members.
        TensorPrimitives.CosineSimilarity(centroid, a).ShouldBe(0.7071f, 0.01f);
        TensorPrimitives.CosineSimilarity(centroid, b).ShouldBe(0.7071f, 0.01f);
    }

    [Fact]
    public void Centroid_of_empty_set_is_null()
    {
        _clusterer.Centroid([]).ShouldBeNull();
    }

    private static float[] UnitVector(float x, float y, float z)
    {
        var vector = new[] { x, y, z };
        var norm = TensorPrimitives.Norm(vector);
        if (norm > 0f)
        {
            TensorPrimitives.Divide(vector, norm, vector);
        }

        return vector;
    }
}
