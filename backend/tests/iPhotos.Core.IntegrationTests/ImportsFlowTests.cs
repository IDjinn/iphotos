using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using iPhotos.Application;
using iPhotos.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace iPhotos.Core.IntegrationTests;

public sealed class ImportsFlowTests : IClassFixture<iPhotosApiFactory>
{
    private readonly iPhotosApiFactory _factory;

    public ImportsFlowTests(iPhotosApiFactory factory) => _factory = factory;

    private static byte[] Jpeg(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        using var output = new MemoryStream();
        image.SaveAsJpeg(output);
        return output.ToArray();
    }

    private static byte[] BuildZip(params (string Name, byte[] Content)[] entries)
    {
        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                var entry = zip.CreateEntry(name);
                using var stream = entry.Open();
                stream.Write(content);
            }
        }

        return ms.ToArray();
    }

    private async Task<HttpClient> NewAuthorizedClientAsync()
    {
        var client = _factory.CreateClient();
        var email = $"import-{Guid.NewGuid():N}@example.com";
        // Throwaway per-test account; the password only needs to satisfy the >= 8 chars rule.
        var password = "test-" + Guid.NewGuid().ToString("N");
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password,
        }, JsonOptions.Web);
        register.StatusCode.ShouldBe(HttpStatusCode.Created);
        var auth = await register.Content.ReadFromJsonAsync<AuthResult>(JsonOptions.Web);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Tokens.AccessToken);
        return client;
    }

    private static async Task<Guid> StartImportAsync(HttpClient client, byte[] zipBytes, string fileName = "takeout.zip")
    {
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(zipBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        form.Add(fileContent, "file", fileName);

        var response = await client.PostAsync("/api/imports/zip", form);
        response.StatusCode.ShouldBe(HttpStatusCode.Accepted);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, Guid>>(JsonOptions.Web);
        return body!["jobId"];
    }

    private static async Task<ZipImportJobDto> WaitUntilFinishedAsync(HttpClient client, Guid jobId)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        while (true)
        {
            var response = await client.GetAsync($"/api/imports/{jobId}", cts.Token);
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
            var job = (await response.Content.ReadFromJsonAsync<ZipImportJobDto>(JsonOptions.Web))!;
            if (job.State is JobState.Done or JobState.Failed)
            {
                return job;
            }

            await Task.Delay(300, cts.Token);
        }
    }

    [Fact]
    public async Task ImportZip_ImportsPhotosAndPollsToCompletion()
    {
        using var client = await NewAuthorizedClientAsync();
        var zip = BuildZip(
            ("Takeout/Google Photos/2024/one.jpg", Jpeg(320, 200)),
            ("Takeout/Google Photos/2024/two.jpg", Jpeg(200, 200)),
            ("Takeout/Google Photos/2024/one.jpg.json", """{"title": "one"}"""u8.ToArray()));

        var jobId = await StartImportAsync(client, zip);
        var job = await WaitUntilFinishedAsync(client, jobId);

        job.State.ShouldBe(JobState.Done);
        job.TotalEntries.ShouldBe(3);
        job.Imported.ShouldBe(2);
        job.Ignored.ShouldBe(1);
        job.Duplicated.ShouldBe(0);
        job.FileName.ShouldBe("takeout.zip");

        // The import job finishing does not mean variants are done; poll until Ready.
        using var readyCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        while (true)
        {
            var photos = await client.GetFromJsonAsync<PagedResult<PhotoDto>>("/api/photos?pageSize=50", JsonOptions.Web, readyCts.Token);
            if (photos!.Items.All(p => p.State is PhotoState.Ready or PhotoState.Failed))
            {
                photos.TotalCount.ShouldBe(2);
                photos.Items.ShouldAllBe(p => p.State == PhotoState.Ready);
                break;
            }

            await Task.Delay(300, readyCts.Token);
        }
    }

    [Fact]
    public async Task ImportZip_Twice_SecondRunIsAllDuplicates()
    {
        using var client = await NewAuthorizedClientAsync();
        var zip = BuildZip(("a.jpg", Jpeg(100, 100)), ("b.jpg", Jpeg(120, 80)));

        var first = await WaitUntilFinishedAsync(client, await StartImportAsync(client, zip));
        var second = await WaitUntilFinishedAsync(client, await StartImportAsync(client, zip));

        first.Imported.ShouldBe(2);
        second.Imported.ShouldBe(0);
        second.Duplicated.ShouldBe(2);

        var photos = await client.GetFromJsonAsync<PagedResult<PhotoDto>>("/api/photos?pageSize=50", JsonOptions.Web);
        photos!.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task ImportZip_WithHeicEntry_TranscodesAndImports()
    {
        using var client = await NewAuthorizedClientAsync();
        var fixture = await File.ReadAllBytesAsync(
            Path.Combine(AppContext.BaseDirectory, "TestAssets", "heic-fixture.heic"));
        var zip = BuildZip(("Takeout/Google Photos/autumn.heic", fixture));

        var job = await WaitUntilFinishedAsync(client, await StartImportAsync(client, zip));

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);

        var photos = await client.GetFromJsonAsync<PagedResult<PhotoDto>>("/api/photos?pageSize=50", JsonOptions.Web);
        var photo = photos!.Items.Single();
        photo.MimeType.ShouldBe("image/jpeg");
        photo.FileName.ShouldBe("autumn.jpg");

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        while (true)
        {
            // JsonOptions.Web is required: the API serializes enums as strings.
            var current = (await client.GetFromJsonAsync<PhotoDto>($"/api/photos/{photo.Id}", JsonOptions.Web, cts.Token))!;
            if (current.State is PhotoState.Ready or PhotoState.Failed)
            {
                current.State.ShouldBe(PhotoState.Ready);
                current.Width.ShouldBe(1440);
                break;
            }

            await Task.Delay(300, cts.Token);
        }
    }

    [Fact]
    public async Task ImportZip_NonZipFile_Returns400()
    {
        using var client = await NewAuthorizedClientAsync();

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent([1, 2, 3]);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(fileContent, "file", "archive.rar");

        var response = await client.PostAsync("/api/imports/zip", form);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetImport_FromAnotherUser_Returns404()
    {
        using var owner = await NewAuthorizedClientAsync();
        using var intruder = await NewAuthorizedClientAsync();

        var jobId = await StartImportAsync(owner, BuildZip(("a.jpg", Jpeg(64, 64))));
        var response = await intruder.GetAsync($"/api/imports/{jobId}");

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetImport_WithoutAuth_Returns401()
    {
        var response = await _factory.CreateClient().GetAsync($"/api/imports/{Guid.NewGuid()}");
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ListImports_ReturnsOwnersJobsNewestFirst()
    {
        using var owner = await NewAuthorizedClientAsync();
        using var intruder = await NewAuthorizedClientAsync();

        var first = await StartImportAsync(owner, BuildZip(("a.jpg", Jpeg(64, 64))), "first.zip");
        var second = await StartImportAsync(owner, BuildZip(("b.jpg", Jpeg(64, 64))), "second.zip");
        var intruderJob = await StartImportAsync(intruder, BuildZip(("c.jpg", Jpeg(64, 64))), "intruder.zip");
        await WaitUntilFinishedAsync(owner, first);
        await WaitUntilFinishedAsync(owner, second);

        var response = await owner.GetAsync("/api/imports");
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var jobs = (await response.Content.ReadFromJsonAsync<List<ZipImportJobDto>>(JsonOptions.Web))!;

        // The list is owner-scoped: the intruder's job never appears.
        jobs.Select(j => j.Id).ShouldNotContain(intruderJob);
        var firstIndex = jobs.FindIndex(j => j.Id == first);
        var secondIndex = jobs.FindIndex(j => j.Id == second);
        firstIndex.ShouldBeGreaterThanOrEqualTo(0);
        secondIndex.ShouldBeGreaterThanOrEqualTo(0);
        // Newest first: the second import was created after the first one.
        secondIndex.ShouldBeLessThan(firstIndex);
    }

    [Fact]
    public async Task ListImports_WithoutAuth_Returns401()
    {
        var response = await _factory.CreateClient().GetAsync("/api/imports");
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }
}
