using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Infrastructure.Ai;

/// <summary>
/// Scene labels via any OpenAI-compatible vision endpoint (doc 18 §8, D21): Ollama,
/// LM Studio, OpenAI, Gemini-compatible — only BaseUrl/Model/ApiKey change. The
/// prompt demands strict JSON; the parser is tolerant because local VLMs sometimes
/// wrap or pad it (transient garbage fails the job and the queue retries).
/// </summary>
public sealed class OpenAiCompatibleVisionLabeler(
    HttpClient http,
    IOptions<VisionOptions> options,
    ILogger<OpenAiCompatibleVisionLabeler> logger) : IVisionLabeler
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<LabelResult>> ClassifyAsync(Stream image, CancellationToken cancellationToken = default)
    {
        var vision = options.Value;
        var prompt = vision.Prompt.Replace("{maxLabels}", vision.MaxLabels.ToString());
        IReadOnlyList<ChatContent> userContent =
        [
            new ChatContent("text", "Label this photo.", null),
            new ChatContent("image_url", null, new ImageUrl(ToDataUrl(image))),
        ];
        using var content = new StringContent(
            JsonSerializer.Serialize(new ChatRequest(
                vision.Model,
                [
                    new ChatMessage("system", prompt),
                    new ChatMessage("user", userContent),
                ],
                MaxTokens: 400,
                Temperature: 0.2f),
                Json),
            Encoding.UTF8,
            "application/json");

        using var request = new HttpRequestMessage(HttpMethod.Post, "/chat/completions") { Content = content };
        if (!string.IsNullOrEmpty(vision.ApiKey))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", vision.ApiKey);
        }

        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Vision labeling failed with {(int)response.StatusCode}: {Truncate(body)}");
        }

        var payload = await response.Content.ReadFromJsonAsync<ChatResponse>(Json, cancellationToken);
        var text = payload?.Choices?.FirstOrDefault()?.Message?.Content;
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Vision endpoint returned an empty completion.");
        }

        return ParseLabels(text);
    }

    /// <summary>Extracts the JSON object from the completion (models sometimes pad with prose/fences).</summary>
    public IReadOnlyList<LabelResult> ParseLabels(string completion)
    {
        var start = completion.IndexOf('{');
        var end = completion.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException($"Vision completion is not JSON: {Truncate(completion)}");
        }

        VisionPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<VisionPayload>(completion[start..(end + 1)], Json);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Vision completion is not valid JSON: {Truncate(completion)}", ex);
        }

        var labels = new List<LabelResult>();
        foreach (var label in payload?.Labels ?? [])
        {
            var name = label.Name?.Trim();
            if (string.IsNullOrEmpty(name))
            {
                continue;
            }

            labels.Add(new LabelResult(name, Math.Clamp(label.Score, 0f, 1f)));
        }

        logger.LogDebug("Vision returned {Count} labels", labels.Count);
        return labels;
    }

    private static string ToDataUrl(Stream image)
    {
        using var buffer = new MemoryStream();
        image.CopyTo(buffer);
        return $"data:image/jpeg;base64,{Convert.ToBase64String(buffer.ToArray())}";
    }

    private static string Truncate(string value) => value.Length <= 300 ? value : value[..300] + "…";

    // ── OpenAI chat/completions wire format (request subset + tolerant response) ──

    private sealed record ChatRequest(
        string Model,
        IReadOnlyList<ChatMessage> Messages,
        [property: JsonPropertyName("max_tokens")] int MaxTokens,
        float Temperature);

    private sealed record ChatMessage(string Role, object Content);

    private sealed record ChatContent(
        string Type,
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("image_url")] ImageUrl? Image);

    private sealed record ImageUrl(string Url);

    private sealed record ChatResponse(IReadOnlyList<ChatChoice>? Choices);

    private sealed record ChatChoice(ChatMessagePayload? Message);

    private sealed record ChatMessagePayload(string? Content);

    private sealed record VisionPayload(
        [property: JsonPropertyName("labels")] IReadOnlyList<VisionLabel>? Labels);

    private sealed record VisionLabel(
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("score")] float Score);
}
