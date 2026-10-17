import { authHeaders } from '@/data/api-client';
import { getCachedCloudFileUri } from '@/data/cloud-media-cache';
import { fileUrl, type CloudPhoto } from '@/data/cloud-photos-repository';
import type { PhotoAsset } from '@/data/types';

/** Timeline key of a cloud photo; undated ones are 0 so they sort last like the server's order. */
export function cloudPhotoTime(photo: CloudPhoto): number {
  if (!photo.takenAt) return 0;
  const time = new Date(photo.takenAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Re-resolves a cloud asset's files against the on-disk cache. Assets are built
 * once per feed update, but prefetch keeps filling the cache afterwards — the
 * viewer calls this so recent photos open from disk (and offline) when cached.
 */
export function withCachedCloudUris(asset: PhotoAsset): PhotoAsset {
  if (asset.syncState !== 'cloud') return asset;
  return {
    ...asset,
    uri:
      getCachedCloudFileUri(asset.id, 'original') ??
      getCachedCloudFileUri(asset.id, 'preview') ??
      fileUrl(asset.id, 'preview'),
    fallbackUri: getCachedCloudFileUri(asset.id, 'thumbnail') ?? asset.fallbackUri,
  };
}

/**
 * Maps a cloud photo to the shared asset model: cached files first (original,
 * then preview), the authenticated remote preview otherwise, and the cached
 * thumbnail as the offline fallback for a failed preview.
 */
export function toCloudAsset(photo: CloudPhoto): PhotoAsset {
  const cachedOriginal = getCachedCloudFileUri(photo.id, 'original');
  const cachedPreview = getCachedCloudFileUri(photo.id, 'preview');
  return {
    id: photo.id,
    uri: cachedOriginal ?? cachedPreview ?? fileUrl(photo.id, 'preview'),
    fallbackUri: getCachedCloudFileUri(photo.id, 'thumbnail') ?? undefined,
    filename: photo.title || photo.fileName,
    // iPhone Live Photos are photos (the motion clip is a variant): keep them out of the video path
    // so the grid shows the Live badge and the viewer plays the clip on hold.
    mediaType: photo.mediaType === 'Video' && !photo.isLive ? 'video' : 'photo',
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    creationTime: cloudPhotoTime(photo),
    modificationTime: new Date(photo.createdAt).getTime(),
    duration: photo.durationSeconds || undefined,
    isLive: photo.isLive,
    motionUri: photo.variants.some((v) => v.kind === 'Motion') ? fileUrl(photo.id, 'motion') : undefined,
    // Harmless on cached local files, required on the authenticated remote fallback.
    sourceHeaders: authHeaders(),
    syncState: 'cloud',
  };
}
