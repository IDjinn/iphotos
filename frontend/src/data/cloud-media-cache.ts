import { Directory, File, Paths } from 'expo-file-system';

import { authHeaders, forceRefreshAccessToken } from '@/data/api-client';
import { fileUrl, type CloudPhoto, type VariantKind } from '@/data/cloud-photos-repository';
import { faceCropUrl } from '@/data/people-repository';
import { useSettingsStore } from '@/stores/settings';

/**
 * Persistent on-disk cache for authenticated cloud variants
 * (docs/plans/09-backend-api.md §4.3 files).
 *
 * Every grid thumbnail is cached so revisits — including across app
 * restarts — never hit the network, and the `preview` variant of recent
 * photos is prefetched so opening them in a viewer is instant. Behavior is
 * configurable in Settings: `default` caches everything plus the previews of
 * the 100 most recent photos; `limited` evicts least-recently-written files
 * once the total exceeds `cloudCacheLimitMb`; `all` prefetches previews for
 * the entire library with no eviction.
 * Files live in `Documents/cloud-cache/{photoId}.{kind}`; the in-memory set
 * is seeded once from the directory listing (existence is checked then, since
 * the OS may evict files later — failures fall back to re-downloading).
 */

const DEFAULT_PREVIEW_PREFETCH_COUNT = 100;
const PREVIEW_PREFETCH_CONCURRENCY = 3;
/** Eviction safety margin so the ceiling also covers files added after a pass. */
const LIMIT_HEADROOM_BYTES = 16 * 1024 * 1024;

export type CloudCacheMode = 'default' | 'limited' | 'all';

function cacheDirectory(): Directory {
  return new Directory(Paths.document, 'cloud-cache');
}

function cacheFile(photoId: string, kind: VariantKind): File {
  return new File(cacheDirectory(), `${photoId}.${kind}`);
}

const knownFiles = new Set<string>();
let knownLoaded = false;

function cacheKey(photoId: string, kind: VariantKind): string {
  return `${photoId}:${kind}`;
}

function loadKnownFromDisk(): void {
  if (knownLoaded) return;
  knownLoaded = true;
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return;
    for (const child of dir.list()) {
      const match = /^([^./]+)\.(thumbnail|preview|original)$/.exec(child.name);
      if (match) knownFiles.add(cacheKey(match[1], match[2] as VariantKind));
    }
  } catch {
    // Directory unreadable — treat as empty.
  }
}

/** Synchronous lookup for the render path; null when the variant is not cached. */
export function getCachedCloudFileUri(photoId: string, kind: VariantKind): string | null {
  loadKnownFromDisk();
  if (!knownFiles.has(cacheKey(photoId, kind))) return null;
  return cacheFile(photoId, kind).uri;
}

const pending = new Set<string>();

/**
 * Downloads `kind` for `photo` into the cache (authenticated) and resolves
 * with the local URI. Resolves with the cached URI when already present,
 * and with null on failure or while another download for the same file is
 * already in flight.
 */
export async function ensureCloudFile(photoId: string, kind: VariantKind): Promise<string | null> {
  const cached = getCachedCloudFileUri(photoId, kind);
  if (cached) return cached;

  const key = cacheKey(photoId, kind);
  if (pending.has(key)) return null;
  pending.add(key);
  try {
    const { downloadAsync } = await import('expo-file-system/legacy');
    cacheDirectory().create({ idempotent: true, intermediates: true });
    let result = await downloadAsync(fileUrl(photoId, kind), cacheFile(photoId, kind).uri, {
      headers: authHeaders(),
    });
    if (result.status === 401) {
      // This path bypasses axios, so an expired access token never reaches the
      // client's refresh interceptor — refresh once (single-flight) and retry.
      await forceRefreshAccessToken();
      result = await downloadAsync(fileUrl(photoId, kind), cacheFile(photoId, kind).uri, {
        headers: authHeaders(),
      });
    }
    if (result.status < 200 || result.status >= 300) {
      try {
        const file = cacheFile(photoId, kind);
        if (file.exists) file.delete();
      } catch {
        // Best-effort cleanup.
      }
      return null;
    }
    knownFiles.add(key);
    enforceCacheLimitIfConfigured();
    return result.uri;
  } catch {
    return null;
  } finally {
    pending.delete(key);
  }
}

/**
 * Caches the `preview` variant of recent photos (100 by default, the whole
 * library in `all` mode) so opening them needs no request, evicting previews
 * that fell out of that window (unless `limited`, where size-based eviction
 * decides what stays). Cheap to call repeatedly per session: the eviction
 * scan runs once, and downloads dedupe/cached-skip.
 */
let previewsEvicted = false;

export async function prefetchRecentPreviews(photos: CloudPhoto[]): Promise<void> {
  loadKnownFromDisk();
  const ready = photos.filter((photo) => photo.state === 'Ready' && photo.mediaType === 'Photo');
  const prefetchAll = useSettingsStore.getState().cloudCacheMode === 'all';
  const candidates = prefetchAll ? ready : ready.slice(0, DEFAULT_PREVIEW_PREFETCH_COUNT);
  if (candidates.length === 0) return;

  if (!previewsEvicted && !prefetchAll) {
    previewsEvicted = true;
    evictStalePreviews(new Set(candidates.map((photo) => photo.id)));
  }

  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < candidates.length) {
      const photo = candidates[index++];
      await ensureCloudFile(photo.id, 'preview');
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PREVIEW_PREFETCH_CONCURRENCY, candidates.length) }, worker)
  );
}

/** Removes cached previews whose photo is no longer among the recent window. */
function evictStalePreviews(keepPhotoIds: Set<string>): void {
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return;
    for (const child of dir.list()) {
      const photoId = parseCacheFileName(child.name, 'preview');
      if (photoId !== null && !keepPhotoIds.has(photoId)) {
        child.delete();
        knownFiles.delete(cacheKey(photoId, 'preview'));
      }
    }
  } catch {
    // Best-effort.
  }
}

/** Called by Settings when the mode changes, so window eviction can rerun. */
export function cloudCacheModeChanged(): void {
  previewsEvicted = false;
  enforceCacheLimitIfConfigured();
}

/** Splits `{photoId}.{kind}` back into its parts; null when not a cache file. */
function parseCacheFileName(name: string, kind: VariantKind): string | null {
  const suffix = `.${kind}`;
  if (!name.endsWith(suffix)) return null;
  const photoId = name.slice(0, -suffix.length);
  return photoId.length > 0 && !photoId.includes('.') ? photoId : null;
}

/**
 * `limited` mode only: deletes least-recently-written cache files until the
 * directory fits within the configured MB ceiling (with a small headroom).
 * Sync and best-effort — called right after each cached download.
 */
function enforceCacheLimitIfConfigured(): void {
  const { cloudCacheMode, cloudCacheLimitMb } = useSettingsStore.getState();
  if (cloudCacheMode !== 'limited') return;
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return;
    const ceiling = cloudCacheLimitMb * 1024 * 1024 - LIMIT_HEADROOM_BYTES;
    const kinds: VariantKind[] = ['thumbnail', 'preview', 'original'];
    const entries: { file: File; modifiedAt: number; size: number; key: string }[] = [];
    let totalBytes = 0;
    for (const child of dir.list()) {
      for (const kind of kinds) {
        const photoId = parseCacheFileName(child.name, kind);
        if (photoId === null) continue;
        const file = new File(cacheDirectory(), child.name);
        if (!file.exists) break;
        totalBytes += file.size;
        entries.push({
          file,
          modifiedAt: file.modificationTime ?? 0,
          size: file.size,
          key: cacheKey(photoId, kind),
        });
        break;
      }
    }
    if (totalBytes <= ceiling) return;
    entries.sort((a, b) => a.modifiedAt - b.modifiedAt);
    for (const entry of entries) {
      if (totalBytes <= ceiling) break;
      try {
        entry.file.delete();
      } catch {
        continue;
      }
      totalBytes -= entry.size;
      knownFiles.delete(entry.key);
    }
  } catch {
    // Best-effort.
  }
}

/** Drops every cached cloud file (e.g. on sign-out). */
export function purgeCloudMediaCache(): void {
  try {
    const dir = cacheDirectory();
    if (dir.exists) dir.delete();
  } catch {
    // Best-effort.
  }
  knownFiles.clear();
  faceKnown.clear();
}

// ── Face crops (doc 18 §10) ──────────────────────────────────────────────────
// RN networking ignores HTTP cache headers, so person covers/chips keep their
// own cache entries: `face-{faceId}.crop` next to the photo variants. Crops are
// immutable (one file per face id) and a few KB — exempt from size eviction.

const faceKnown = new Set<string>();
let faceKnownLoaded = false;

function faceCacheFile(faceId: string): File {
  return new File(cacheDirectory(), `face-${faceId}.crop`);
}

function loadFaceKnownFromDisk(): void {
  if (faceKnownLoaded) return;
  faceKnownLoaded = true;
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return;
    for (const child of dir.list()) {
      if (child.name.startsWith('face-') && child.name.endsWith('.crop')) {
        faceKnown.add(child.name.slice('face-'.length, -'.crop'.length));
      }
    }
  } catch {
    // Directory unreadable — treat as empty.
  }
}

/** Synchronous lookup for the render path; null while the crop is not cached. */
export function getCachedFaceCropUri(faceId: string): string | null {
  loadFaceKnownFromDisk();
  return faceKnown.has(faceId) ? faceCacheFile(faceId).uri : null;
}

const facePending = new Set<string>();

/**
 * Downloads the face crop (authenticated) into the cache and resolves with the
 * local URI. Resolves with null while another download for the same face is in
 * flight or on failure — callers fall back to the authenticated remote URL.
 */
export async function ensureFaceCrop(faceId: string): Promise<string | null> {
  const cached = getCachedFaceCropUri(faceId);
  if (cached) return cached;
  if (facePending.has(faceId)) return null;
  facePending.add(faceId);
  try {
    const { downloadAsync } = await import('expo-file-system/legacy');
    cacheDirectory().create({ idempotent: true, intermediates: true });
    let result = await downloadAsync(faceCropUrl(faceId), faceCacheFile(faceId).uri, {
      headers: authHeaders(),
    });
    if (result.status === 401) {
      // Same as variants: this bypasses axios, so refresh once and retry.
      await forceRefreshAccessToken();
      result = await downloadAsync(faceCropUrl(faceId), faceCacheFile(faceId).uri, {
        headers: authHeaders(),
      });
    }
    if (result.status < 200 || result.status >= 300) {
      try {
        const file = faceCacheFile(faceId);
        if (file.exists) file.delete();
      } catch {
        // Best-effort cleanup.
      }
      return null;
    }
    faceKnown.add(faceId);
    return result.uri;
  } catch {
    return null;
  } finally {
    facePending.delete(faceId);
  }
}
