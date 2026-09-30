import { Directory, File, Paths } from 'expo-file-system';

import { db } from '@/data/db';
import { forEachLibraryPhoto } from '@/data/media-repository';
import type { PhotoAsset } from '@/data/types';

/**
 * Local low-resolution preview pipeline (docs/plans/13-encrypted-mode.md).
 *
 * Grid cells render a ~512px JPEG thumbnail instead of the full-resolution
 * original so scrolling stays smooth on large libraries, and so the encrypted
 * offline mode has a small preview to show without decrypting originals.
 * Files live in `Documents/thumbnails/{assetId}.jpg`; the SQLite table is
 * bookkeeping only (existence is also checked on disk, since files can be
 * evicted by the OS while the DB row survives).
 */

const THUMBNAIL_EDGE = 512;
const THUMBNAIL_QUALITY = 0.75;

export function thumbnailDirectory(): string {
  return `${Paths.document}/thumbnails`;
}

function thumbnailFile(assetId: string): File {
  return new File(`${thumbnailDirectory()}/${assetId}.jpg`);
}

/** In-memory existence cache so grid cells never touch the filesystem while rendering. */
const knownThumbnails = new Set<string>();
let knownLoaded = false;

function loadKnownFromDb(): void {
  if (knownLoaded) return;
  knownLoaded = true;
  try {
    const rows = db.getAllSync<{ asset_id: string }>('SELECT asset_id FROM thumbnails');
    for (const row of rows) {
      if (thumbnailFile(row.asset_id).exists) knownThumbnails.add(row.asset_id);
    }
  } catch {
    // Table not migrated yet — treat as empty.
  }
}

/** Synchronous lookup for the render path; null when no thumbnail exists yet. */
export function getCachedThumbnailUri(assetId: string): string | null {
  loadKnownFromDb();
  return knownThumbnails.has(assetId) ? thumbnailFile(assetId).uri : null;
}

const pending = new Set<string>();

/**
 * Generates a thumbnail for `asset` if missing. Returns the URI when one
 * already exists; otherwise resolves with the new URI once generated (or
 * null on failure). Concurrent calls for the same asset are deduplicated.
 */
export async function ensureThumbnail(asset: PhotoAsset): Promise<string | null> {
  if (asset.mediaType !== 'photo') return null;
  const existing = getCachedThumbnailUri(asset.id);
  if (existing) return existing;
  if (pending.has(asset.id)) return null;

  pending.add(asset.id);
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      asset.uri,
      [{ resize: { width: THUMBNAIL_EDGE, height: THUMBNAIL_EDGE } }],
      { format: SaveFormat.JPEG, compress: THUMBNAIL_QUALITY }
    );
    const dest = thumbnailFile(asset.id);
    const source = new File(result.uri);
    // manipulateAsync writes to the cache dir; move it into our persistent dir.
    source.move(dest);
    db.runSync('INSERT OR REPLACE INTO thumbnails (asset_id, created_at) VALUES (?, ?)', [
      asset.id,
      Date.now(),
    ]);
    knownThumbnails.add(asset.id);
    return dest.uri;
  } catch {
    return null;
  } finally {
    pending.delete(asset.id);
  }
}

export interface ThumbnailBatchProgress {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
}

/**
 * Incremental background pass over the whole library, generating any missing
 * photo thumbnails. Yields between batches so the UI stays responsive.
 */
export async function generateMissingThumbnails(
  onProgress?: (progress: ThumbnailBatchProgress) => void,
  shouldStop?: () => boolean
): Promise<ThumbnailBatchProgress> {
  const progress: ThumbnailBatchProgress = { total: 0, generated: 0, skipped: 0, failed: 0 };
  pruneOrphanThumbnails();

  await forEachLibraryPhoto(async (assets, totalCount) => {
    if (shouldStop?.()) return false;
    progress.total = totalCount;
    for (const asset of assets) {
      if (shouldStop?.()) return false;
      if (knownThumbnails.has(asset.id) || pending.has(asset.id)) {
        progress.skipped++;
        continue;
      }
      const uri = await ensureThumbnail(asset);
      if (uri) progress.generated++;
      else progress.failed++;
    }
    onProgress?.({ ...progress });
    return true;
  });
  return progress;
}

/** Drops thumbnail rows/files for assets that left the library. */
export function purgeThumbnails(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const placeholders = assetIds.map(() => '?').join(',');
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM thumbnails WHERE asset_id IN (${placeholders})`, assetIds);
  });
  for (const id of assetIds) {
    knownThumbnails.delete(id);
    try {
      const file = thumbnailFile(id);
      if (file.exists) file.delete();
    } catch {
      // Best-effort file removal.
    }
  }
}

/**
 * Removes thumbnail files whose row is gone (e.g. purged with asset metadata)
 * and rows whose file was evicted. Called at the start of a batch run.
 */
export function pruneOrphanThumbnails(): void {
  loadKnownFromDb();
  try {
    const rows = db.getAllSync<{ asset_id: string }>('SELECT asset_id FROM thumbnails');
    const rowIds = new Set(rows.map((r) => r.asset_id));
    const dir = new Directory(thumbnailDirectory());
    if (dir.exists) {
      for (const child of dir.list()) {
        const match = /^([^./]+)\.jpg$/.exec(child.name);
        if (match && !rowIds.has(match[1])) child.delete();
      }
    }
    for (const id of rowIds) {
      if (!thumbnailFile(id).exists) {
        db.runSync('DELETE FROM thumbnails WHERE asset_id = ?', [id]);
        knownThumbnails.delete(id);
      }
    }
  } catch {
    // Best-effort.
  }
}
