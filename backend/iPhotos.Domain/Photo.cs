namespace iPhotos.Domain;

public enum PhotoState
{
    PendingProcessing,
    Processing,
    Ready,
    Failed,

    /// <summary>Created by an upload ticket; bytes not yet uploaded by the client.</summary>
    PendingUpload,
}

public enum VariantKind
{
    Original,
    Preview,
    Thumbnail,
}

public enum MediaType
{
    Photo,
    Video,
}

public sealed record PhotoMetadata(
    int Width,
    int Height,
    DateTimeOffset? TakenAt,
    string? CameraMake,
    string? CameraModel,
    double? GpsLatitude,
    double? GpsLongitude,
    double? DurationSeconds = null);

public sealed class Photo
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public MediaType MediaType { get; set; } = MediaType.Photo;
    public long SizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }

    /// <summary>Playback length in seconds; videos only.</summary>
    public double? DurationSeconds { get; set; }
    public DateTimeOffset? TakenAt { get; set; }
    public string? CameraMake { get; set; }
    public string? CameraModel { get; set; }
    public double? GpsLatitude { get; set; }
    public double? GpsLongitude { get; set; }

    /// <summary>Catalog title seeded by imports (e.g. Google Takeout sidecars).</summary>
    public string? Title { get; set; }

    /// <summary>Catalog description/caption seeded by imports (e.g. Google Takeout sidecars).</summary>
    public string? Description { get; set; }

    public PhotoState State { get; set; }
    public string? LastError { get; set; }
    public string OriginalBlobPath { get; set; } = string.Empty;

    /// <summary>Quality of the currently stored bytes (UploadQualities.Original until the
    /// worker applies storage-saver compression/transcoding).</summary>
    public string StoredQuality { get; set; } = UploadQualities.Original;

    /// <summary>Direct-upload multipart session id while the bytes are still incoming
    /// (PendingUpload only); the orphan sweeper aborts stale sessions with it.</summary>
    public string? MultipartUploadId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static Photo Create(
        Guid ownerId,
        string contentHash,
        string fileName,
        string mimeType,
        long sizeBytes,
        DateTimeOffset now,
        MediaType mediaType = MediaType.Photo) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        ContentHash = contentHash,
        FileName = fileName,
        MimeType = mimeType,
        MediaType = mediaType,
        SizeBytes = sizeBytes,
        State = PhotoState.PendingProcessing,
        CreatedAt = now,
        UpdatedAt = now,
    };

    /// <summary>
    /// Direct-upload flow: the row exists (dedup + quota reserved) before the client
    /// has uploaded any bytes; <see cref="MarkUploadedForProcessing"/> completes it.
    /// </summary>
    public static Photo CreatePendingUpload(
        Guid ownerId,
        string contentHash,
        string fileName,
        string mimeType,
        long sizeBytes,
        DateTimeOffset now,
        MediaType mediaType = MediaType.Photo) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        ContentHash = contentHash,
        FileName = fileName,
        MimeType = mimeType,
        MediaType = mediaType,
        SizeBytes = sizeBytes,
        State = PhotoState.PendingUpload,
        CreatedAt = now,
        UpdatedAt = now,
    };

    public void MarkUploadedForProcessing(DateTimeOffset now)
    {
        if (State != PhotoState.PendingUpload)
        {
            throw new InvalidOperationException($"Cannot confirm upload for a photo in state {State}.");
        }

        State = PhotoState.PendingProcessing;
        Touch(now);
    }

    public void MarkProcessing(DateTimeOffset now)
    {
        if (State is not (PhotoState.PendingProcessing or PhotoState.Failed))
        {
            throw new InvalidOperationException($"Cannot start processing a photo in state {State}.");
        }

        State = PhotoState.Processing;
        Touch(now);
    }

    public void MarkReady(PhotoMetadata metadata, DateTimeOffset now)
    {
        if (State != PhotoState.Processing)
        {
            throw new InvalidOperationException($"Cannot mark a photo in state {State} as ready.");
        }

        Width = metadata.Width;
        Height = metadata.Height;
        DurationSeconds = metadata.DurationSeconds;

        // EXIF fills gaps only: values seeded at import time (Google Takeout sidecars
        // or date folders) are authoritative and must not be clobbered by a null EXIF.
        TakenAt ??= metadata.TakenAt;
        GpsLatitude ??= metadata.GpsLatitude;
        GpsLongitude ??= metadata.GpsLongitude;
        CameraMake = metadata.CameraMake;
        CameraModel = metadata.CameraModel;
        LastError = null;
        State = PhotoState.Ready;
        Touch(now);
    }

    /// <summary>
    /// Seeds catalog fields from an import source (Google Takeout sidecars or date
    /// folders) while the photo is still in PendingProcessing; the variant worker
    /// later fills any remaining gaps from EXIF.
    /// </summary>
    public void SeedImportMetadata(
        DateTimeOffset? takenAt,
        double? gpsLatitude,
        double? gpsLongitude,
        string? title,
        string? description)
    {
        if (State != PhotoState.PendingProcessing)
        {
            throw new InvalidOperationException($"Cannot seed metadata for a photo in state {State}.");
        }

        TakenAt = takenAt;
        GpsLatitude = gpsLatitude;
        GpsLongitude = gpsLongitude;
        Title = NullIfEmpty(title);
        Description = NullIfEmpty(description);
    }

    /// <summary>
    /// Marks the stored bytes as storage-saver processed: the original upload was
    /// replaced by the compressed/transcoded result (hash, size and mime updated
    /// alongside by the caller).
    /// </summary>
    public void MarkSaverStored(DateTimeOffset now)
    {
        StoredQuality = UploadQualities.StorageSaver;
        Touch(now);
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public void MarkFailed(string error, DateTimeOffset now)
    {
        if (State != PhotoState.Processing)
        {
            throw new InvalidOperationException($"Cannot fail a photo in state {State}.");
        }

        LastError = error;
        State = PhotoState.Failed;
        Touch(now);
    }

    private void Touch(DateTimeOffset now) => UpdatedAt = now;
}
