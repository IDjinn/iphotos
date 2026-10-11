using System.IO.Compression;
using System.Text;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.UnitTests;

public class ZipImportHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly InMemoryPhotoRepository _photos = new();
    private readonly InMemoryVariantRepository _variants = new();
    private readonly InMemoryVariantJobRepository _variantJobs = new();
    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryZipImportRepository _imports = new();
    private readonly FakeBlobStorage _blobs = new();
    private readonly FakeUnitOfWork _uow = new();
    private readonly FakeHeifConverter _heif = new();
    private readonly FakeVideoProcessor _video = new();
    private readonly User _owner = User.Create("owner@example.com", "hash", null, 1_000_000_000, Now);

    public ZipImportHandlerTests()
    {
        _users.AddAsync(_owner).GetAwaiter().GetResult();
    }

    private ZipImportHandler NewHandler(ZipImportOptions? options = null) =>
        new(
            _imports,
            _blobs,
            NewPhotoService(),
            _heif,
            _uow,
            new StubDateTimeProvider(Now),
            NullLogger<ZipImportHandler>.Instance,
            Options.Create(options ?? new ZipImportOptions()));

    private PhotoService NewPhotoService() =>
        new(_photos, _variants, _variantJobs, _users, _blobs, new Sha256ContentHasher(),
            new FakeImageVariantGenerator(),
            // EXIF-neutral: these tests verify sidecar/date-folder seeding only.
            new FakeExifExtractor { Metadata = new PhotoMetadata(0, 0, null, null, null, null, null) },
            _video,
            _uow, new StubDateTimeProvider(Now),
            TestMlJobs.CreateEnqueuer(),
            new InMemoryMlInputCache(),
            Microsoft.Extensions.Options.Options.Create(new UploadOptions()));

    private ZipImportJob NewJob(byte[] zipBytes)
    {
        var blobPath = BlobPaths.Import(_owner.Id, Guid.NewGuid());
        _blobs.Blobs[blobPath] = zipBytes;
        return ZipImportJob.Create(_owner.Id, "takeout.zip", zipBytes.Length, blobPath, Now);
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

    private static byte[] Bytes(string content) => Encoding.UTF8.GetBytes(content);

    private static byte[] FlagEntriesAsEncrypted(byte[] zipBytes)
    {
        var bytes = (byte[])zipBytes.Clone();
        // Local file header (PK\x03\x04): GP flags at offset 6; central directory
        // (PK\x01\x02): GP flags at offset 8. Bit 0 marks ZipCrypto encryption.
        for (var i = 0; i < bytes.Length - 4; i++)
        {
            if (bytes[i] == 0x50 && bytes[i + 1] == 0x4B
                && bytes[i + 2] == 0x03 && bytes[i + 3] == 0x04)
            {
                bytes[i + 6] |= 0x01;
            }
            else if (bytes[i] == 0x50 && bytes[i + 1] == 0x4B
                && bytes[i + 2] == 0x01 && bytes[i + 3] == 0x02)
            {
                bytes[i + 8] |= 0x01;
            }
        }

        return bytes;
    }

    [Fact]
    public async Task Process_LivePhotoPair_FlagsPhotoLiveAndSkipsMotionFile()
    {
        // Motion file listed BEFORE the still: pairing must not depend on zip order.
        var zip = BuildZip(
            ("Takeout/Google Photos/2024/IMG_1234.mov", Bytes("motion")),
            ("Takeout/Google Photos/2024/IMG_1234.HEIC", Bytes("heic-still")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.VideosImported.ShouldBe(0);
        job.Ignored.ShouldBe(1);
        job.Failed.ShouldBe(0);

        var still = _photos.Photos.Single();
        still.FileName.ShouldBe("IMG_1234.jpg");
        still.MediaType.ShouldBe(MediaType.Photo);
        still.IsLive.ShouldBeTrue();
    }

    [Fact]
    public async Task Process_SameStemVideoWithoutPhotoSibling_ImportsAsStandaloneVideo()
    {
        var zip = BuildZip(
            ("Takeout/Google Photos/2024/clip.mov", Bytes("video")),
            ("Takeout/Google Photos/2024/other.jpg", Bytes("jpeg")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(2);
        job.VideosImported.ShouldBe(1);
        job.Ignored.ShouldBe(0);

        var video = _photos.Photos.Single(p => p.MediaType == MediaType.Video);
        video.FileName.ShouldBe("clip.mov");
        video.IsLive.ShouldBeFalse();
    }

    [Fact]
    public async Task Process_SameStemInDifferentFolders_DoNotPair()
    {
        var zip = BuildZip(
            ("Album A/IMG_1.jpg", Bytes("jpeg-a")),
            ("Album B/IMG_1.mov", Bytes("video-b")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(2);
        job.VideosImported.ShouldBe(1);
        _photos.Photos.Single(p => p.MediaType == MediaType.Photo).IsLive.ShouldBeFalse();
    }

    [Fact]
    public async Task Process_LivePairStillFailsToDecode_MotionImportsAsVideo()
    {
        _heif.ThrowOnConvert = new InvalidDataException("not a decodable image");
        var zip = BuildZip(
            ("IMG_9.heic", Bytes("broken-heic")),
            ("IMG_9.mov", Bytes("motion")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Failed.ShouldBe(1);
        job.Imported.ShouldBe(1);
        job.VideosImported.ShouldBe(1);
        _photos.Photos.Single().MediaType.ShouldBe(MediaType.Video);
    }

    [Fact]
    public async Task Process_LivePairOverPreviouslyImportedStill_UpgradeRowToLive()
    {
        var stillZip = NewJob(BuildZip(("IMG_55.jpg", Bytes("jpeg-55"))));
        await NewHandler().ProcessJobAsync(stillZip);
        _photos.Photos.Single().IsLive.ShouldBeFalse();

        var pairZip = NewJob(BuildZip(
            ("IMG_55.jpg", Bytes("jpeg-55")),
            ("IMG_55.mov", Bytes("motion"))));
        await NewHandler().ProcessJobAsync(pairZip);

        pairZip.Duplicated.ShouldBe(1);
        pairZip.Imported.ShouldBe(0);
        pairZip.Ignored.ShouldBe(1);
        var photo = _photos.Photos.Single();
        photo.IsLive.ShouldBeTrue();
    }

    [Fact]
    public async Task Process_LivePairOverLegacyImportedVideo_ConvertsVideoRowToMotion()
    {
        // Older builds imported the motion file as a standalone video and left the
        // still unflagged — exactly the state a pre-pairing library has on disk.
        var service = NewPhotoService();
        await service.UploadAsync(_owner.Id, "IMG_56.jpg", "image/jpeg", new MemoryStream(Bytes("jpeg-56")));
        await service.UploadAsync(_owner.Id, "IMG_56.mov", "video/quicktime", new MemoryStream(Bytes("legacy-motion")));
        _photos.Photos.Count.ShouldBe(2);
        _photos.Photos.Single(p => p.MediaType == MediaType.Photo).IsLive.ShouldBeFalse();

        var pairZip = NewJob(BuildZip(
            ("IMG_56.jpg", Bytes("jpeg-56")),
            ("IMG_56.mov", Bytes("paired-motion"))));
        await NewHandler().ProcessJobAsync(pairZip);

        // The zip pass promotes the still and attaches its motion file; the
        // post-pass adoption sweep then removes the leftover legacy video row.
        pairZip.Duplicated.ShouldBe(1);
        pairZip.Ignored.ShouldBe(1);
        _photos.Photos.Count.ShouldBe(1);
        var photo = _photos.Photos.Single();
        photo.MediaType.ShouldBe(MediaType.Photo);
        photo.IsLive.ShouldBeTrue();
        var motion = _variants.Variants.Single(v => v.Kind == VariantKind.Motion);
        motion.PhotoId.ShouldBe(photo.Id);
        _blobs.Blobs[motion.BlobPath].ShouldBe(Encoding.UTF8.GetBytes("paired-motion"));
    }

    [Fact]
    public async Task Process_MixedTakeoutZip_ImportsPhotosAndCountsTheRest()
    {
        var zip = BuildZip(
            ("Takeout/Google Photos/2024/one.jpg", Bytes("jpeg-one")),
            ("Takeout/Google Photos/2024/two.png", Bytes("png-two")),
            ("three.webp", Bytes("webp-three")),
            ("Takeout/Google Photos/2024/one.jpg.json", Bytes("{\"title\": \"one\"}")),
            ("archive_browser.html", Bytes("<html></html>")),
            ("metadata.csv", Bytes("a,b")),
            ("__MACOSX/Takeout/._one.jpg", Bytes("junk")),
            (".DS_Store", Bytes("junk")),
            ("Thumbs.db", Bytes("junk")),
            ("Takeout/Google Photos/2024/clip.mp4", Bytes("video")),
            ("Takeout/Google Photos/2024/other.zip", Bytes("nested")),
            ("Takeout/Google Photos/2024/photo.gif", Bytes("gif")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.TotalEntries.ShouldBe(12);
        job.Imported.ShouldBe(4);
        job.VideosImported.ShouldBe(1);
        job.Ignored.ShouldBe(8);
        job.Duplicated.ShouldBe(0);
        job.Failed.ShouldBe(0);
        _photos.Photos.Count.ShouldBe(4);
        _photos.Photos.Select(p => p.FileName).ShouldBe(
            ["one.jpg", "two.png", "three.webp", "clip.mp4"], ignoreOrder: true);
        _photos.Photos.ShouldAllBe(p => p.OwnerId == _owner.Id);
        _photos.Photos.Single(p => p.FileName == "clip.mp4").MediaType.ShouldBe(MediaType.Video);

        // Sidecars seed catalog metadata on the photo they sit next to.
        var one = _photos.Photos.Single(p => p.FileName == "one.jpg");
        one.Title.ShouldBe("one");

        // The staged zip blob is cleaned up after success.
        _blobs.Blobs.ContainsKey(job.BlobPath).ShouldBeFalse();
    }

    [Fact]
    public async Task Process_SupplementalSidecar_SeedsTakenAtGpsTitleAndDescription()
    {
        const string sidecar = """
            {
              "title": "IMG_3069.JPG",
              "description": "Beach day",
              "creationTime": { "timestamp": "1737841732" },
              "photoTakenTime": { "timestamp": "1737838060" },
              "geoData": { "latitude": 0.0, "longitude": 0.0 },
              "geoDataExif": { "latitude": -23.2217, "longitude": -44.7309 }
            }
            """;
        var zip = BuildZip(
            ("Takeout/Google Fotos/Fotos de 2025/IMG_3069.JPG", Bytes("jpeg-3069")),
            ("Takeout/Google Fotos/Fotos de 2025/IMG_3069.JPG.supplemental-metadata.json", Bytes(sidecar)));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.Ignored.ShouldBe(1);
        var photo = _photos.Photos.Single();
        photo.TakenAt.ShouldBe(DateTimeOffset.FromUnixTimeSeconds(1737838060));
        photo.GpsLatitude.ShouldBe(-23.2217);
        photo.GpsLongitude.ShouldBe(-44.7309);
        photo.Title.ShouldBe("IMG_3069.JPG");
        photo.Description.ShouldBe("Beach day");
    }

    [Fact]
    public async Task Process_LegacySidecarOnlyWithCreationTime_SeedsTakenAtFromCreationTime()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("jpeg-a")),
            ("a.jpg.json", Bytes("{\"creationTime\": { \"timestamp\": \"1700000000\" }}")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        var photo = _photos.Photos.Single();
        photo.TakenAt.ShouldBe(DateTimeOffset.FromUnixTimeSeconds(1700000000));
        photo.GpsLatitude.ShouldBeNull();
        photo.Title.ShouldBeNull();
    }

    [Fact]
    public async Task Process_FullDateFolder_SeedsTakenAtWhenNoSidecar()
    {
        var zip = BuildZip(("Takeout/Google Photos/2024-03-25/sunny.jpg", Bytes("jpeg-sunny")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        var photo = _photos.Photos.Single();
        photo.TakenAt.ShouldBe(new DateTimeOffset(2024, 3, 25, 0, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public async Task Process_YearOnlyFolder_DoesNotSeedTakenAt()
    {
        var zip = BuildZip(("Takeout/Google Fotos/Fotos de 2025/unsure.jpg", Bytes("jpeg-unsure")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        // A wrong-but-present date would block the (possibly absent) EXIF date from
        // filling in later, so year-only folders seed nothing.
        _photos.Photos.Single().TakenAt.ShouldBeNull();
    }

    [Fact]
    public async Task Process_SidecarWithZeroCoordinates_SeedsNoGps()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("jpeg-a")),
            ("a.jpg.json", Bytes("{\"photoTakenTime\": {\"timestamp\": \"1700000000\"}, \"geoData\": {\"latitude\": 0.0, \"longitude\": 0.0}}")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        var photo = _photos.Photos.Single();
        photo.TakenAt.ShouldNotBeNull();
        photo.GpsLatitude.ShouldBeNull();
        photo.GpsLongitude.ShouldBeNull();
    }

    [Fact]
    public async Task Process_MalformedSidecar_PhotoStillImports()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("jpeg-a")),
            ("a.jpg.json", Bytes("{not-json")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.Failed.ShouldBe(0);
        _photos.Photos.Single().TakenAt.ShouldBeNull();
    }

    [Fact]
    public async Task Process_HeicEntry_SidecarMatchesOriginalEntryName()
    {
        var zip = BuildZip(
            ("IMG_0001.heic", Bytes("heic-bytes")),
            ("IMG_0001.heic.supplemental-metadata.json", Bytes("{\"title\": \"Happy day\"}")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        var photo = _photos.Photos.Single(p => p.FileName == "IMG_0001.jpg");
        photo.Title.ShouldBe("Happy day");
    }

    [Fact]
    public async Task Process_ReimportedZip_CountsEverythingAsDuplicated()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("jpeg-a")),
            ("b.jpg", Bytes("jpeg-b")),
            ("c.png", Bytes("png-c")));
        var first = NewJob(zip);
        var second = NewJob(zip);
        var handler = NewHandler();

        await handler.ProcessJobAsync(first);
        await handler.ProcessJobAsync(second);

        first.State.ShouldBe(JobState.Done);
        first.Imported.ShouldBe(3);
        second.State.ShouldBe(JobState.Done);
        second.Imported.ShouldBe(0);
        second.Duplicated.ShouldBe(3);
        _photos.Photos.Count.ShouldBe(3);
    }

    [Fact]
    public async Task Process_HeifEntries_TranscodesToJpegAndImports()
    {
        var zip = BuildZip(
            ("IMG_0001.heic", Bytes("heic-bytes")),
            ("IMG_0002.heif", Bytes("heif-bytes")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        _heif.Called.ShouldBeTrue();
        job.Imported.ShouldBe(2);
        _photos.Photos.Select(p => p.FileName).ShouldBe(["IMG_0001.jpg", "IMG_0002.jpg"], ignoreOrder: true);
        _photos.Photos.ShouldAllBe(p => p.MimeType == "image/jpeg");
    }

    [Fact]
    public async Task Process_EncryptedZip_FailsPermanentlyWithClearError()
    {
        var job = NewJob(FlagEntriesAsEncrypted(BuildZip(("a.jpg", Bytes("jpeg-a")))));

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Failed);
        job.LastError.ShouldBe("Protected/encrypted ZIPs are not supported.");
        job.Attempts.ShouldBe(job.MaxAttempts);
        _photos.Photos.ShouldBeEmpty();
        _blobs.Blobs.ContainsKey(job.BlobPath).ShouldBeTrue();
    }

    [Fact]
    public async Task Process_QuotaExceeded_FailsPermanentlyWithClearMessage()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("jpeg-a")),
            ("b.jpg", Bytes("jpeg-b")));
        var job = NewJob(zip);
        _owner.StorageQuotaBytes = 5; // fits nothing — both entries blow the quota

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Failed);
        job.LastError.ShouldNotBeNull();
        job.LastError.ShouldContain("quota");
        job.Attempts.ShouldBe(job.MaxAttempts);
    }

    [Fact]
    public async Task Process_TooManyEntries_FailsPermanently()
    {
        var zip = BuildZip(
            ("a.jpg", Bytes("a")),
            ("b.jpg", Bytes("b")),
            ("c.jpg", Bytes("c")));
        var job = NewJob(zip);

        await NewHandler(new ZipImportOptions { MaxEntries = 2 }).ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Failed);
        job.LastError.ShouldNotBeNull();
        job.LastError.ShouldContain("limit");
        _photos.Photos.ShouldBeEmpty();
    }

    [Fact]
    public async Task Process_CorruptZip_FailsAndRequeuesForRetry()
    {
        var job = NewJob([0x50, 0x4B, 0x00, 0x01, 0x02, 0x03]);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Queued);
        job.Attempts.ShouldBe(1);
        job.LastError.ShouldNotBeNull();
    }

    [Fact]
    public async Task Process_ZipSlipEntryName_FlattensAndImports()
    {
        var zip = BuildZip(("../../evil.jpg", Bytes("jpeg-evil")));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        _photos.Photos.Single().FileName.ShouldBe("evil.jpg");
    }

    [Fact]
    public async Task Process_UndecodableHeifEntry_CountsAsFailedAndContinues()
    {
        var zip = BuildZip(
            ("good.jpg", Bytes("jpeg-good")),
            ("broken.heic", Bytes("not-really-heic")));
        var job = NewJob(zip);
        _heif.ThrowOnConvert = new InvalidImageException("Could not decode HEIC/HEIF image.");

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.Failed.ShouldBe(1);
        job.ProcessedEntries.ShouldBe(2);
    }

    [Fact]
    public async Task Process_VideoEntry_ImportsWithSidecarSeedAndVideoMetadata()
    {
        const string sidecar = """
            {
              "title": "Beach clip",
              "photoTakenTime": { "timestamp": "1737838060" },
              "geoDataExif": { "latitude": -23.2217, "longitude": -44.7309 }
            }
            """;
        var zip = BuildZip(
            ("Takeout/Google Photos/2025/VID_3069.mp4", Bytes("video-bytes")),
            ("Takeout/Google Photos/2025/VID_3069.mp4.supplemental-metadata.json", Bytes(sidecar)));
        var job = NewJob(zip);

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.VideosImported.ShouldBe(1);
        job.Ignored.ShouldBe(1); // the sidecar
        var video = _photos.Photos.Single();
        video.FileName.ShouldBe("VID_3069.mp4");
        video.MediaType.ShouldBe(MediaType.Video);
        video.MimeType.ShouldBe("video/mp4");
        video.DurationSeconds.ShouldBe(_video.Info.DurationSeconds);
        video.TakenAt.ShouldBe(DateTimeOffset.FromUnixTimeSeconds(1737838060));
        video.Title.ShouldBe("Beach clip");

        // The original lands under its video extension; poster variants are JPEG.
        _blobs.Blobs.Keys.ShouldContain(video.OriginalBlobPath);
        video.OriginalBlobPath.EndsWith("/original.mp4").ShouldBeTrue();
        _variants.Variants.Select(v => v.Kind).ShouldBe(
            [VariantKind.Original, VariantKind.Preview, VariantKind.Thumbnail], ignoreOrder: true);
    }

    [Fact]
    public async Task Process_UndecodableVideoEntry_CountsAsFailedAndContinues()
    {
        var zip = BuildZip(
            ("good.jpg", Bytes("jpeg-good")),
            ("broken.mp4", Bytes("not-really-video")));
        var job = NewJob(zip);
        _video.ThrowOnProcess = new InvalidImageException("The stream is not a decodable video.");

        await NewHandler().ProcessJobAsync(job);

        job.State.ShouldBe(JobState.Done);
        job.Imported.ShouldBe(1);
        job.Failed.ShouldBe(1);
        job.VideosImported.ShouldBe(0);
        job.ProcessedEntries.ShouldBe(2);
    }

    [Fact]
    public async Task Process_ReimportedZipWithVideo_CountsVideoAsDuplicated()
    {
        var zip = BuildZip(
            ("clip.mp4", Bytes("video-bytes")),
            ("a.jpg", Bytes("jpeg-a")));
        var first = NewJob(zip);
        var second = NewJob(zip);
        var handler = NewHandler();

        await handler.ProcessJobAsync(first);
        await handler.ProcessJobAsync(second);

        first.VideosImported.ShouldBe(1);
        second.Imported.ShouldBe(0);
        second.Duplicated.ShouldBe(2);
        second.VideosImported.ShouldBe(0);
    }
}
