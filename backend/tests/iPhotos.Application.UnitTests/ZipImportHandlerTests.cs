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
        new(_photos, _variants, _variantJobs, _users, _blobs, new Sha256ContentHasher(), _uow, new StubDateTimeProvider(Now));

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
        job.Imported.ShouldBe(3);
        job.Ignored.ShouldBe(9);
        job.Duplicated.ShouldBe(0);
        job.Failed.ShouldBe(0);
        _photos.Photos.Count.ShouldBe(3);
        _photos.Photos.Select(p => p.FileName).ShouldBe(["one.jpg", "two.png", "three.webp"], ignoreOrder: true);
        _photos.Photos.ShouldAllBe(p => p.OwnerId == _owner.Id);

        // The staged zip blob is cleaned up after success.
        _blobs.Blobs.ContainsKey(job.BlobPath).ShouldBeFalse();
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
}
