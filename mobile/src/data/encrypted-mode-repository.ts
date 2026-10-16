import * as MediaLibrary from 'expo-media-library/legacy';

import { db } from '@/data/db';
import { forEachLibraryPhoto } from '@/data/media-repository';
import { ensureThumbnail } from '@/data/thumbnails';
import type { PhotoAsset } from '@/data/types';
import { decryptFile, encryptFile } from '@/data/vault-crypto';
import {
  encryptedCacheFile,
  encryptedFile,
  ensureEncryptedDirectories,
  getSessionKey,
} from '@/data/encrypted-crypto';

/**
 * Encrypted offline mode (docs/plans/13-encrypted-mode.md).
 *
 * Opt-in mode that removes the photo library from the system media store and
 * keeps it as AES-256-GCM ciphertext in app-private storage, unlocked with a
 * password. A small encrypted thumbnail per photo lets the in-app gallery
 * browse without decrypting originals; full images decrypt on demand into a
 * session cache that is purged on lock. Photos only in v1 (no videos).
 */

interface EncryptedAssetRow {
  asset_id: string;
  filename: string;
  width: number;
  height: number;
  creation_time: number;
  size: number;
  encrypted_at: number;
}

export interface MigrationProgress {
  phase: 'encrypting' | 'decrypting';
  total: number;
  processed: number;
  failed: number;
}

function deleteQuiet(name: string): void {
  try {
    const file = encryptedCacheFile(name);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

function removeEncryptedAsset(assetId: string, filename: string): void {
  db.runSync('DELETE FROM encrypted_assets WHERE asset_id = ?', [assetId]);
  for (const thumb of [false, true]) {
    try {
      const file = encryptedFile(assetId, thumb);
      if (file.exists) file.delete();
    } catch {
      // Best-effort.
    }
  }
  deleteQuiet(`${assetId}.thumb.jpg`);
  deleteQuiet(`${assetId}.full.jpg`);
  void filename;
}

async function assetStillExists(id: string): Promise<boolean> {
  try {
    await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
    return true;
  } catch {
    return false;
  }
}

async function encryptOne(asset: PhotoAsset): Promise<boolean> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
    shouldDownloadFromNetwork: false,
  }).catch(() => null);
  const srcUri = info?.localUri ?? info?.uri ?? asset.uri;
  if (!srcUri) return false;

  ensureEncryptedDirectories();
  const key = getSessionKey();

  // Encrypted preview so the gallery can browse without touching originals.
  const thumbUri = await ensureThumbnail(asset);
  if (thumbUri) {
    try {
      await encryptFile(thumbUri, encryptedFile(asset.id, true), key);
    } catch {
      // Preview is optional — the row still works without it.
    }
  }

  const dest = encryptedFile(asset.id);
  await encryptFile(srcUri, dest, key);

  db.runSync(
    `INSERT OR REPLACE INTO encrypted_assets (asset_id, filename, width, height, creation_time, size, encrypted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [asset.id, asset.filename, asset.width, asset.height, asset.creationTime, dest.size, Date.now()]
  );

  try {
    await MediaLibrary.deleteAssetsAsync([asset.id]);
  } catch {
    // The system refused the delete — roll back unless already gone.
    if (await assetStillExists(asset.id)) {
      removeEncryptedAsset(asset.id, asset.filename);
      return false;
    }
  }
  return true;
}

/**
 * Encrypts every photo in the media library and removes it from the system
 * gallery. Resumable: already-encrypted ids are skipped. Requires an
 * unlocked session (call `unlockWithPassword` after `setupPassword`).
 */
export async function encryptLibrary(
  onProgress?: (progress: MigrationProgress) => void,
  shouldStop?: () => boolean
): Promise<MigrationProgress> {
  const progress: MigrationProgress = { phase: 'encrypting', total: 0, processed: 0, failed: 0 };
  const done = new Set(
    db.getAllSync<{ asset_id: string }>('SELECT asset_id FROM encrypted_assets').map((r) => r.asset_id)
  );

  await forEachLibraryPhoto(async (assets, totalCount) => {
    if (shouldStop?.()) return false;
    progress.total = totalCount;
    for (const asset of assets) {
      if (shouldStop?.()) return false;
      if (done.has(asset.id)) continue;
      try {
        if (await encryptOne(asset)) {
          done.add(asset.id);
          progress.processed++;
        } else {
          progress.failed++;
        }
      } catch {
        progress.failed++;
      }
      onProgress?.({ ...progress });
    }
    return true;
  });
  return progress;
}

function listRows(): EncryptedAssetRow[] {
  return db.getAllSync<EncryptedAssetRow>(
    'SELECT asset_id, filename, width, height, creation_time, size, encrypted_at FROM encrypted_assets ORDER BY creation_time DESC'
  );
}

export function getEncryptedCount(): number {
  return db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM encrypted_assets')?.count ?? 0;
}

/** Decrypts the thumbnail of `assetId` into the session cache, if present. */
async function ensureThumbUri(row: EncryptedAssetRow): Promise<string> {
  const target = encryptedCacheFile(`${row.asset_id}.thumb.jpg`);
  if (target.exists) return target.uri;
  const source = encryptedFile(row.asset_id, true);
  if (!source.exists) return '';
  try {
    await decryptFile(source, target, getSessionKey());
    return target.uri;
  } catch {
    return '';
  }
}

/**
 * Grid-ready assets for the encrypted gallery: previews only, decrypted into
 * the session cache. Originals resolve on demand via
 * `resolveEncryptedOriginal`.
 */
export async function loadEncryptedGridAssets(): Promise<PhotoAsset[]> {
  const assets: PhotoAsset[] = [];
  for (const row of listRows()) {
    assets.push({
      id: row.asset_id,
      uri: await ensureThumbUri(row),
      filename: row.filename,
      mediaType: 'photo',
      width: row.width,
      height: row.height,
      creationTime: row.creation_time,
      modificationTime: row.encrypted_at,
    });
  }
  return assets;
}

/** Lazily decrypts the full-resolution original for the viewer. */
export async function resolveEncryptedOriginal(assetId: string): Promise<string> {
  const target = encryptedCacheFile(`${assetId}.full.jpg`);
  if (target.exists) return target.uri;
  await decryptFile(encryptedFile(assetId), target, getSessionKey());
  return target.uri;
}

/**
 * Decrypts every encrypted photo back into the system media library and
 * tears the mode down. The caller verifies the password first.
 */
export async function decryptAllBack(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationProgress> {
  const progress: MigrationProgress = { phase: 'decrypting', total: 0, processed: 0, failed: 0 };
  const rows = listRows();
  progress.total = rows.length;
  onProgress?.({ ...progress });
  for (const row of rows) {
    try {
      const uri = await resolveEncryptedOriginal(row.asset_id);
      await MediaLibrary.saveToLibraryAsync(uri);
      removeEncryptedAsset(row.asset_id, row.filename);
      progress.processed++;
    } catch {
      progress.failed++;
    }
    onProgress?.({ ...progress });
  }
  return progress;
}
