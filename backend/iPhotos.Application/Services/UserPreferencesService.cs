using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Domain;

namespace iPhotos.Application.Services;

/// <summary>
/// Account-wide upload quality (original vs storage saver, Google Photos style).
/// The choice lives on the user row so every client and the zip importer see the
/// same value; the variant worker applies it to the stored bytes.
/// </summary>
public sealed class UserPreferencesService(
    IPhotoRepository photos,
    IUserRepository users,
    IVariantJobRepository jobs,
    IUnitOfWork unitOfWork,
    IDateTimeProvider dateTime,
    Microsoft.Extensions.Options.IOptions<UploadOptions> uploadOptions)
{
    public async Task<UserPreferencesDto> GetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");
        return await BuildDtoAsync(user, cancellationToken);
    }

    /// <summary>
    /// Persists the new quality. With <c>ApplyToExisting</c>, re-enqueues variant jobs
    /// for the photos whose stored bytes can be rewritten to match (original → saver);
    /// the rewrite direction is one-way because saver compression discards the source.
    /// </summary>
    public async Task<UserPreferencesDto> UpdateAsync(
        Guid userId,
        UpdateUserPreferencesRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!UploadQualities.IsValid(request.UploadQuality))
        {
            throw new ValidationException(
                $"Unknown upload quality '{request.UploadQuality}'. Use '{UploadQualities.Original}' or '{UploadQualities.StorageSaver}'.");
        }

        var user = await users.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException($"User '{userId}' was not found.");

        if (user.UploadQuality != request.UploadQuality)
        {
            user.SetUploadQuality(request.UploadQuality, dateTime.UtcNow);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        if (request.ApplyToExisting)
        {
            var (imageCap, videoCap) = uploadOptions.Value.CapsFor(user.Plan, user.UploadQuality);
            var mismatchIds = await photos.ListQualityMismatchIdsAsync(
                user.Id, user.UploadQuality, imageCap, videoCap, cancellationToken);
            foreach (var photoId in mismatchIds)
            {
                await jobs.EnqueueAsync(photoId, cancellationToken);
            }

            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return await BuildDtoAsync(user, cancellationToken);
    }

    private async Task<UserPreferencesDto> BuildDtoAsync(User user, CancellationToken cancellationToken)
    {
        var (imageCap, videoCap) = uploadOptions.Value.CapsFor(user.Plan, user.UploadQuality);
        var mismatchIds = await photos.ListQualityMismatchIdsAsync(
            user.Id, user.UploadQuality, imageCap, videoCap, cancellationToken);
        return new UserPreferencesDto(user.UploadQuality, mismatchIds.Count, imageCap, videoCap);
    }
}
