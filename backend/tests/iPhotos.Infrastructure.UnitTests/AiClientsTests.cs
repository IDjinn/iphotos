using System.Net;
using iPhotos.Application;
using iPhotos.Infrastructure.Ai;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Shouldly;
using Xunit;

namespace iPhotos.Infrastructure.UnitTests;

public class OpenAiCompatibleVisionLabelerTests
{
    private static OpenAiCompatibleVisionLabeler NewLabeler() =>
        new(new HttpClient(), Options.Create(new VisionOptions()), NullLogger<OpenAiCompatibleVisionLabeler>.Instance);

    [Fact]
    public void Parses_plain_json_payload()
    {
        var labels = NewLabeler().ParseLabels("""{"labels":[{"name":"beach","score":0.9},{"name":"sunset","score":0.7}]}""");

        labels.Count.ShouldBe(2);
        labels[0].Name.ShouldBe("beach");
        labels[0].Score.ShouldBe(0.9f);
        labels[1].Name.ShouldBe("sunset");
    }

    [Fact]
    public void Parses_json_fenced_in_prose()
    {
        var labels = NewLabeler().ParseLabels(
            "Here you go!\n```json\n{\"labels\":[{\"name\":\"dog\",\"score\":0.95}]}\n```\nHope this helps.");

        labels.ShouldHaveSingleItem();
        labels[0].Name.ShouldBe("dog");
    }

    [Fact]
    public void Empty_label_set_is_valid()
    {
        NewLabeler().ParseLabels("""{"labels":[]}""").ShouldBeEmpty();
    }

    [Theory]
    [InlineData("sorry, I cannot label images")]
    [InlineData("[1, 2, 3]")]
    public void Non_json_completions_fail_the_job(string completion)
    {
        Should.Throw<InvalidOperationException>(() => NewLabeler().ParseLabels(completion));
    }

    [Fact]
    public void Score_is_clamped_to_unit_range()
    {
        var labels = NewLabeler().ParseLabels("""{"labels":[{"name":"food","score":1.7},{"name":"table","score":-0.2}]}""");

        labels[0].Score.ShouldBe(1f);
        labels[1].Score.ShouldBe(0f);
    }
}

public class HttpMlFaceProviderTests
{
    [Fact]
    public async Task Detect_maps_bbox_scores_and_embeddings()
    {
        var response = """
            {
              "model": "buffalo_l",
              "provider": "CPUExecutionProvider",
              "faces": [
                { "bbox": [10.5, 20.4, 88.0, 96.2], "detScore": 0.97, "embedding": [0.1, 0.2, 0.3] }
              ]
            }
            """;
        var handler = new FakeHandler(HttpStatusCode.OK, response);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://ml:8080/") };
        var provider = new HttpMlFaceProvider(
            http,
            Options.Create(new MlOptions { BaseUrl = "http://ml:8080", ApiKey = "test-key" }),
            NullLogger<HttpMlFaceProvider>.Instance);

        using var image = new MemoryStream([1, 2, 3, 4]);
        var faces = await provider.DetectAsync(image);

        faces.ShouldHaveSingleItem();
        faces[0].X.ShouldBe(10.5f);
        faces[0].Y.ShouldBe(20.4f);
        faces[0].Width.ShouldBe(88f);
        faces[0].Height.ShouldBe(96.2f);
        faces[0].DetScore.ShouldBe(0.97f);
        faces[0].Embedding.ShouldBe([0.1f, 0.2f, 0.3f]);
        // The API key travels in the X-Api-Key header (storage-host pattern).
        handler.LastRequest!.Headers.GetValues("X-Api-Key").ShouldHaveSingleItem().ShouldBe("test-key");
    }

    [Fact]
    public async Task Inference_error_surfaces_as_InvalidOperationException()
    {
        var http = new HttpClient(new FakeHandler(HttpStatusCode.InternalServerError, """{"detail":"boom"}"""))
        {
            BaseAddress = new Uri("http://ml:8080/"),
        };
        var provider = new HttpMlFaceProvider(
            http, Options.Create(new MlOptions()), NullLogger<HttpMlFaceProvider>.Instance);

        using var image = new MemoryStream([1]);
        await Should.ThrowAsync<InvalidOperationException>(() => provider.DetectAsync(image));
    }

    private sealed class FakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
        }
    }
}
