using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using iPhotos.Application;
using iPhotos.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace iPhotos.Core.IntegrationTests;

public sealed class PhotosFlowTests : IClassFixture<iPhotosApiFactory>
{
    private readonly iPhotosApiFactory _factory;

    public PhotosFlowTests(iPhotosApiFactory factory) => _factory = factory;

    private static byte[] JpegWithExif(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.Metadata.ExifProfile = new ExifProfile();
        image.Metadata.ExifProfile.SetValue(ExifTag.DateTimeOriginal, "2025:12:25 10:30:00");
        image.Metadata.ExifProfile.SetValue(ExifTag.Make, "Google");
        image.Metadata.ExifProfile.SetValue(ExifTag.Model, "Pixel 9");
        using var output = new MemoryStream();
        image.SaveAsJpeg(output);
        return output.ToArray();
    }

    private async Task<HttpClient> NewAuthorizedClientAsync()
    {
        var client = _factory.CreateClient();
        var email = $"photo-{Guid.NewGuid():N}@example.com";
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "password123",
        }, JsonOptions.Web);
        register.StatusCode.ShouldBe(HttpStatusCode.Created);
        var auth = await register.Content.ReadFromJsonAsync<AuthResult>(JsonOptions.Web);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Tokens.AccessToken);
        return client;
    }

    private static async Task<PhotoDto> WaitUntilReadyAsync(HttpClient client, Guid photoId)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        while (true)
        {
            var response = await client.GetAsync($"/api/photos/{photoId}", cts.Token);
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
            var photo = (await response.Content.ReadFromJsonAsync<PhotoDto>(JsonOptions.Web))!;
            if (photo.State is PhotoState.Ready or PhotoState.Failed)
            {
                return photo;
            }

            await Task.Delay(500, cts.Token);
        }
    }

    [Fact]
    public async Task Upload_IndexesMetadata_GeneratesVariants_ServesAndDeletes()
    {
        using var client = await NewAuthorizedClientAsync();
        var jpeg = JpegWithExif(640, 200);

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(jpeg);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(fileContent, "file", "vacation.jpg");

        var upload = await client.PostAsync("/api/photos", form);
        upload.StatusCode.ShouldBe(HttpStatusCode.Created);
        var result = await upload.Content.ReadFromJsonAsync<PhotoUploadResult>(JsonOptions.Web);
        result!.Duplicated.ShouldBeFalse();
        result.Photo.Id.ShouldNotBe(Guid.Empty);

        // The worker indexes EXIF metadata and generates variants.
        var ready = await WaitUntilReadyAsync(client, result.Photo.Id);
        ready.State.ShouldBe(PhotoState.Ready);
        ready.Width.ShouldBe(640);
        ready.Height.ShouldBe(200);
        ready.TakenAt.ShouldNotBeNull();
        ready.TakenAt!.Value.UtcDateTime.ShouldBe(new DateTime(2025, 12, 25, 10, 30, 0));
        ready.CameraModel.ShouldBe("Pixel 9");
        ready.Variants.Select(v => v.Kind).ShouldBe(
            [VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail], ignoreOrder: true);

        // Thumbnail is served as a downscaled JPEG.
        var thumb = await client.GetAsync($"/api/photos/{result.Photo.Id}/files/thumbnail");
        thumb.StatusCode.ShouldBe(HttpStatusCode.OK);
        thumb.Content.Headers.ContentType!.MediaType.ShouldBe("image/jpeg");
        using var thumbImage = await Image.LoadAsync(await thumb.Content.ReadAsStreamAsync());
        thumbImage.Width.ShouldBe(320);
        thumbImage.Height.ShouldBe(100);

        // Blobs are immutable: the response carries cache directives, and revalidation
        // with the ETag yields 304 without the body.
        thumb.Headers.CacheControl!.ToString().ShouldContain("immutable");
        thumb.Headers.ETag.ShouldNotBeNull();
        using var revalidate = new HttpRequestMessage(HttpMethod.Get, $"/api/photos/{result.Photo.Id}/files/thumbnail");
        revalidate.Headers.IfNoneMatch.Add(thumb.Headers.ETag!);
        var notModified = await client.SendAsync(revalidate);
        notModified.StatusCode.ShouldBe(HttpStatusCode.NotModified);
        (await notModified.Content.ReadAsByteArrayAsync()).ShouldBeEmpty();

        // Original bytes round-trip untouched.
        var original = await client.GetAsync($"/api/photos/{result.Photo.Id}/files/original");
        original.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await original.Content.ReadAsByteArrayAsync()).ShouldBe(jpeg);

        // Re-uploading identical content dedups.
        using var dupForm = new MultipartFormDataContent();
        var dupContent = new ByteArrayContent(jpeg);
        dupContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        dupForm.Add(dupContent, "file", "copy.jpg");
        var dup = await client.PostAsync("/api/photos", dupForm);
        dup.StatusCode.ShouldBe(HttpStatusCode.OK);
        var dupResult = await dup.Content.ReadFromJsonAsync<PhotoUploadResult>(JsonOptions.Web);
        dupResult!.Duplicated.ShouldBeTrue();
        dupResult.Photo.Id.ShouldBe(result.Photo.Id);

        // Usage accounts for the photo.
        var usage = await client.GetFromJsonAsync<UsageSummary>("/api/usage", JsonOptions.Web);
        usage!.PhotoCount.ShouldBe(1);
        usage.QuotaBytes.ShouldBeGreaterThan(0);
        usage.UsedBytes.ShouldBeGreaterThanOrEqualTo(jpeg.Length);

        // Delete removes everything.
        (await client.DeleteAsync($"/api/photos/{result.Photo.Id}")).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync($"/api/photos/{result.Photo.Id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Upload_UnsupportedContentType_Returns400()
    {
        using var client = await NewAuthorizedClientAsync();

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent([1, 2, 3]);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(fileContent, "file", "doc.pdf");

        var upload = await client.PostAsync("/api/photos", form);

        upload.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UploadTicket_FileystemBlobStorage_CannotPresign_Returns501()
    {
        using var client = await NewAuthorizedClientAsync();

        var response = await client.PostAsJsonAsync("/api/photos/upload-ticket", new
        {
            fileName = "vacation.jpg",
            contentType = "image/jpeg",
            sizeBytes = 123,
            contentHash = "hash-1",
        }, JsonOptions.Web);

        // Filesystem blob storage has no client-reachable upload URL; clients fall
        // back to the multipart endpoint when they see 501.
        response.StatusCode.ShouldBe(HttpStatusCode.NotImplemented);
    }

    [Fact]
    public async Task List_ReturnsPhotosForOwner()
    {
        using var client = await NewAuthorizedClientAsync();
        using var other = await NewAuthorizedClientAsync();

        foreach (var name in new[] { "a.jpg", "b.jpg" })
        {
            using var form = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(JpegWithExif(50 + name[0], 40));
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(fileContent, "file", name);
            (await client.PostAsync("/api/photos", form)).StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        var mine = await client.GetFromJsonAsync<PagedResult<PhotoDto>>("/api/photos?pageSize=50", JsonOptions.Web);
        var theirs = await other.GetFromJsonAsync<PagedResult<PhotoDto>>("/api/photos?pageSize=50", JsonOptions.Web);

        mine!.TotalCount.ShouldBe(2);
        theirs!.TotalCount.ShouldBe(0);
    }

    [Fact]
    public async Task GetPhoto_FromAnotherUser_Returns404()
    {
        using var owner = await NewAuthorizedClientAsync();
        using var intruder = await NewAuthorizedClientAsync();

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(JpegWithExif(30, 30));
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(fileContent, "file", "secret.jpg");
        var upload = await owner.PostAsync("/api/photos", form);
        var result = await upload.Content.ReadFromJsonAsync<PhotoUploadResult>(JsonOptions.Web);

        (await intruder.GetAsync($"/api/photos/{result!.Photo.Id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await intruder.DeleteAsync($"/api/photos/{result.Photo.Id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await intruder.GetAsync($"/api/photos/{result.Photo.Id}/files/original")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
