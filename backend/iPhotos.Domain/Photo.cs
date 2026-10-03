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

public sealed record PhotoMetadata(
    int Width,
    int Height,
    DateTimeOffset? TakenAt,
    string? CameraMake,
    string? CameraModel,
    double? GpsLatitude,
    double? GpsLongitude);

public sealed class Photo
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public DateTimeOffset? TakenAt { get; set; }
    public string? CameraMake { get; set; }
    public string? CameraModel { get; set; }
    public double? GpsLatitude { get; set; }
    public double? GpsLongitude { get; set; }
    public PhotoState State { get; set; }
    public string? LastError { get; set; }
    public string OriginalBlobPath { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public static Photo Create(
        Guid ownerId,
        string contentHash,
        string fileName,
        string mimeType,
        long sizeBytes,
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        ContentHash = contentHash,
        FileName = fileName,
        MimeType = mimeType,
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
        DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        OwnerId = ownerId,
        ContentHash = contentHash,
        FileName = fileName,
        MimeType = mimeType,
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
        TakenAt = metadata.TakenAt;
        CameraMake = metadata.CameraMake;
        CameraModel = metadata.CameraModel;
        GpsLatitude = metadata.GpsLatitude;
        GpsLongitude = metadata.GpsLongitude;
        LastError = null;
        State = PhotoState.Ready;
        Touch(now);
    }

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
