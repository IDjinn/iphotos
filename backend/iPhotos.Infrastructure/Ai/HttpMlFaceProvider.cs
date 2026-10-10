using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.Ai;

/// <summary>
/// Face inference against the self-hosted ml container (doc 18 §4.3): image bytes
/// in, bboxes + unit-norm 512-d embeddings out. Cloud face APIs plug in behind
/// IFaceInferenceProvider later (face-index mode, D20).
/// </summary>
public sealed class HttpMlFaceProvider(
    HttpClient http,
    IOptions<MlOptions> options,
    ILogger<HttpMlFaceProvider> logger) : IFaceInferenceProvider
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<DetectedFace>> DetectAsync(Stream image, CancellationToken cancellationToken = default)
    {
        var ml = options.Value;
        using var content = new ByteArrayContent(await ToBytesAsync(image, cancellationToken));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/faces/detect") { Content = content };
        if (!string.IsNullOrEmpty(ml.ApiKey))
        {
            request.Headers.Add("X-Api-Key", ml.ApiKey);
        }

        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Face inference failed with {(int)response.StatusCode}: {Truncate(body)}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<MlDetectResponse>(stream, Json, cancellationToken);
        var faces = payload?.Faces ?? [];

        var result = new List<DetectedFace>(faces.Count);
        foreach (var face in faces)
        {
            if (face.Bbox is not { Length: 4 } bbox || face.Embedding is not { Length: > 0 } embedding)
            {
                continue;
            }

            result.Add(new DetectedFace(
                bbox[0], bbox[1], bbox[2], bbox[3], face.DetScore, embedding));
        }

        return result;
    }

    private static async Task<byte[]> ToBytesAsync(Stream image, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        await image.CopyToAsync(buffer, cancellationToken);
        return buffer.ToArray();
    }

    private static string Truncate(string value) => value.Length <= 300 ? value : value[..300] + "…";

    private sealed record MlDetectResponse(
        [property: JsonPropertyName("model")] string? Model,
        [property: JsonPropertyName("faces")] List<MlFace>? Faces);

    private sealed record MlFace(
        [property: JsonPropertyName("bbox")] float[]? Bbox,
        [property: JsonPropertyName("detScore")] float DetScore,
        [property: JsonPropertyName("embedding")] float[]? Embedding);
}
