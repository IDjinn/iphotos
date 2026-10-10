using System.Numerics.Tensors;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace iPhotos.Application.Services;

/// <summary>Per-job AI work contract for the ML queue workers.</summary>
public interface IMlJobHandler
{
    Task ProcessJobAsync(MlJob job, CancellationToken cancellationToken = default);
}

/// <summary>
/// Processes one faces job (doc 18 §6.2): runs detection over the photo's preview
/// variant, stores face rows + crops, does incremental person assignment against
/// stored centroids and schedules an owner reclustering pass. Owns the job's state
/// transitions (mirrors <see cref="VariantProcessingHandler"/>).
/// </summary>
public sealed class FaceProcessingService(
    IPhotoRepository photos,
    IVariantRepository variants,
    IFaceInferenceProvider faceProvider,
    IFaceCropper cropper,
    IFaceClusterer clusterer,
    IFaceRepository faces,
    IPersonRepository persons,
    IMlJobRepository jobs,
    IBlobStorage blobStorage,
    IMlInputCache inputCache,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    IOptions<MlOptions> options,
    ILogger<FaceProcessingService> logger) : IMlJobHandler
{
    public const string EmbeddingModel = "buffalo_l";

    public async Task ProcessJobAsync(MlJob job, CancellationToken cancellationToken = default)
    {
        var ml = options.Value;

        var photo = await photos.GetByIdAsync(job.PhotoId!.Value, cancellationToken);
        if (photo is null || photo.State != PhotoState.Ready || photo.MediaType != MediaType.Photo)
        {
            // Deleted before processing, or not a photo — nothing to do.
            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        try
        {
            // Faces are computed once per photo; a re-Ready photo (storage-saver rewrite)
            // keeps its existing rows — re-detection would orphan the old crops.
            if ((await faces.ListByPhotoAsync(photo.Id, cancellationToken)).Count > 0)
            {
                job.Complete(dateTime.UtcNow);
                await unitOfWork.SaveChangesAsync(cancellationToken);
                return;
            }

            var previewPath = BlobPaths.Preview(photo.OwnerId, photo.Id);
            IReadOnlyList<DetectedFace> detections;
            await using (var preview = await OpenInputAsync(photo.Id, MlInputKind.Preview, previewPath, cancellationToken))
            {
                detections = await faceProvider.DetectAsync(preview, cancellationToken);
            }

            var accepted = detections
                .Where(f => f.DetScore >= ml.MinDetScore
                            && f.Width >= ml.MinFaceSizePx
                            && f.Height >= ml.MinFaceSizePx)
                .ToList();

            // Reopen the preview once for cropping (the provider consumed the first
            // stream); ImageSharp reads whole-stream, so rewind between crops.
            var ownerPersons = await persons.ListForOwnerAsync(photo.OwnerId, cancellationToken);
            var storedFaces = new List<PhotoFace>(accepted.Count);
            if (accepted.Count > 0)
            {
                await using var preview = await OpenInputAsync(photo.Id, MlInputKind.Preview, previewPath, cancellationToken);
                foreach (var detection in accepted)
                {
                    var face = PhotoFace.Create(
                        photo.Id, photo.OwnerId, EmbeddingModel,
                        detection.X, detection.Y, detection.Width, detection.Height,
                        detection.DetScore, detection.Embedding, string.Empty, dateTime.UtcNow);
                    face.CropBlobPath = BlobPaths.FaceCrop(photo.OwnerId, photo.Id, face.Id);

                    preview.Position = 0;
                    await using var crop = await cropper.CropAsync(
                        preview, detection.X, detection.Y, detection.Width, detection.Height, FaceCropLongEdge, cancellationToken);
                    await blobStorage.PutAsync(face.CropBlobPath, crop, cancellationToken);

                    storedFaces.Add(face);
                }
            }

            await AssignIncrementalAsync(photo.OwnerId, ownerPersons, storedFaces, cancellationToken);
            await faces.AddRangeAsync(storedFaces, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Faces job {JobId}: {Stored}/{Detected} faces stored for photo {PhotoId}",
                job.Id, storedFaces.Count, detections.Count, photo.Id);

            job.Complete(dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            // The staged preview was consumed — drop it (the stale sweep is the
            // safety net for early-complete paths that never read it).
            inputCache.Delete(photo.Id, MlInputKind.Preview);

            // Keep clusters fresh after new faces land (debounced by HasPending).
            if (storedFaces.Count > 0 && !await jobs.HasPendingAsync(photo.OwnerId, MlJobKind.Cluster, cancellationToken))
            {
                await jobs.EnqueueAsync(photo.OwnerId, null, MlJobKind.Cluster, cancellationToken);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var willRetry = job.Fail(ex.Message, dateTime.UtcNow);
            logger.LogWarning(ex, "Faces job {JobId} failed, {Outcome} (attempt {Attempt}/{Max})",
                job.Id, willRetry ? "requeued" : "permanently failed", job.Attempts, job.MaxAttempts);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    /// <summary>Face crop long edge in pixels — used for person covers/merge UI chips.</summary>
    public const int FaceCropLongEdge = 160;

    /// <summary>Local cache first (doc 18 §6.2); the blob download is the fallback for
    /// a cold cache (worker restarts, library backfill of pre-cache photos).</summary>
    private async Task<Stream> OpenInputAsync(Guid photoId, MlInputKind kind, string blobPath, CancellationToken cancellationToken)
    {
        var cached = await inputCache.TryOpenReadAsync(photoId, kind, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        // Information, not Debug: every one of these lines is one blob-storage
        // (S3) GET on the ML path — the level that makes cold-cache causes
        // (backfill, 48h sweep, volume recreated) visible next to the
        // storage host's "GET s3:..." line.
        logger.LogInformation("ML input cache miss for photo {PhotoId} ({Kind}); downloading {BlobPath}", photoId, kind, blobPath);
        return await blobStorage.OpenReadAsync(blobPath, cancellationToken);
    }

    /// <summary>
    /// Assigns each new face to the closest person centroid above the match threshold
    /// (doc 18 §7.1); unmatched faces stay null until the reclustering job groups them.
    /// Centroids move by incremental mean; covers only improve.
    /// </summary>
    private async Task AssignIncrementalAsync(
        Guid ownerId,
        IReadOnlyList<Person> ownerPersons,
        List<PhotoFace> newFaces,
        CancellationToken cancellationToken)
    {
        if (newFaces.Count == 0)
        {
            return;
        }

        var threshold = options.Value.MatchThreshold;
        foreach (var face in newFaces)
        {
            Person? best = null;
            var bestSimilarity = threshold;
            foreach (var person in ownerPersons)
            {
                if (person.Centroid is not { Length: > 0 } centroid || person.FaceCount == 0)
                {
                    continue;
                }

                var similarity = TensorPrimitives.CosineSimilarity(centroid, face.Embedding);
                if (similarity >= bestSimilarity)
                {
                    bestSimilarity = similarity;
                    best = person;
                }
            }

            if (best is not null)
            {
                face.PersonId = best.Id;
                best.FaceCount++;
                best.Centroid = IncrementalCentroid(best.Centroid, best.FaceCount, face.Embedding);

                if (await ImprovesCoverAsync(best, face, cancellationToken))
                {
                    best.CoverFaceId = face.Id;
                }
            }
        }
    }

    /// <summary>True when the new face outranks the person's current cover (same ranking as the cluster job).</summary>
    private async Task<bool> ImprovesCoverAsync(Person person, PhotoFace candidate, CancellationToken cancellationToken)
    {
        if (person.CoverFaceId is not { } coverId)
        {
            return true;
        }

        var cover = await faces.GetByIdAsync(coverId, cancellationToken);
        return cover is null || candidate.CoverScore > cover.CoverScore;
    }

    /// <summary>normalized((old × previousCount + embedding) / newCount) — exact mean drifts
    /// only by float rounding and is corrected by the full reclustering pass.</summary>
    private static float[] IncrementalCentroid(float[]? oldCentroid, int newCount, float[] embedding)
    {
        if (oldCentroid is not { Length: > 0 } || newCount <= 1)
        {
            return embedding;
        }

        var mean = new float[oldCentroid.Length];
        TensorPrimitives.Multiply(oldCentroid, newCount - 1, mean);
        TensorPrimitives.Add(mean, embedding, mean);
        TensorPrimitives.Divide(mean, newCount, mean);
        var norm = TensorPrimitives.Norm(mean);
        if (norm > 0f)
        {
            TensorPrimitives.Divide(mean, norm, mean);
        }

        return mean;
    }
}
