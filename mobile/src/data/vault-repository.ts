import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { db, purgeAssetMetadata } from './db';
import { getLockedIdList } from './locked-repository';
import { fetchAssetsByIds } from './media-repository';
import type { PhotoAsset } from './types';
import {
  decryptFile,
  ensureVaultDirectories,
  encryptFile,
  vaultDirectory,
  vaultSessionCache,
} from './vault-crypto';

/**
 * Encrypted vault behind the Locked Folder. Moving an item here copies the
 * file into app-private storage as AES-256-GCM ciphertext and then removes it
 * from the system media library, so it is invisible to every other app.
 * Decrypted plaintext lives only in the session cache, purged on re-lock.
 */

interface VaultAssetRow {
  id: string;
  media_type: 'photo' | 'video';
  filename: string;
  width: number;
  height: number;
  duration: number | null;
  creation_time: number;
  size: number;
  has_poster: number;
  added_at: number;
}

export interface ImportResult {
  imported: number;
  failed: number;
}

export interface ExportResult {
  exported: number;
  failed: number;
}

function extension(filename: string, mediaType: 'photo' | 'video'): string {
  const dot = filename.lastIndexOf('.');
  if (dot > 0 && dot >= filename.length - 5) return filename.slice(dot + 1).toLowerCase();
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

function vaultFile(id: string, poster = false): File {
  return new File(vaultDirectory(), `${id}${poster ? '.poster' : ''}.bin`);
}

function cacheFile(row: VaultAssetRow, kind: 'full' | 'poster'): File {
  const name =
    kind === 'poster' ? `${row.id}.poster.jpg` : `${row.id}.${extension(row.filename, row.media_type)}`;
  return new File(vaultSessionCache(), name);
}

function deleteQuiet(file: File): void {
  try {
    file.delete();
  } catch {
    // Already gone.
  }
}

function getVaultRow(id: string): VaultAssetRow | null {
  return (
    db.getFirstSync<VaultAssetRow>(
      'SELECT id, media_type, filename, width, height, duration, creation_time, size, has_poster, added_at FROM vault_assets WHERE id = ?',
      [id]
    ) ?? null
  );
}

function insertVaultRow(row: VaultAssetRow): void {
  db.runSync(
    `INSERT INTO vault_assets (id, media_type, filename, width, height, duration, creation_time, size, has_poster, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.media_type,
      row.filename,
      row.width,
      row.height,
      row.duration,
      row.creation_time,
      row.size,
      row.has_poster,
      row.added_at,
    ]
  );
}

function deleteVaultEntry(id: string, filename?: string, mediaType: 'photo' | 'video' = 'photo'): void {
  db.runSync('DELETE FROM vault_assets WHERE id = ?', [id]);
  deleteQuiet(vaultFile(id));
  deleteQuiet(vaultFile(id, true));
  if (filename) deleteQuiet(new File(vaultSessionCache(), `${id}.${extension(filename, mediaType)}`));
  deleteQuiet(new File(vaultSessionCache(), `${id}.poster.jpg`));
}

/** Still resolvable through the system media store? (used after a failed delete) */
async function assetStillExists(id: string): Promise<boolean> {
  try {
    await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
    return true;
  } catch {
    return false;
  }
}

async function importOne(asset: PhotoAsset): Promise<boolean> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
    shouldDownloadFromNetwork: false,
  }).catch(() => null);
  const srcUri = info?.localUri ?? info?.uri ?? asset.uri;
  if (!srcUri) return false;

  ensureVaultDirectories();
  const id = Crypto.randomUUID();
  const dest = vaultFile(id);
  await encryptFile(srcUri, dest);

  const row: VaultAssetRow = {
    id,
    media_type: asset.mediaType === 'video' ? 'video' : 'photo',
    filename: asset.filename || (asset.mediaType === 'video' ? 'video.mp4' : 'photo.jpg'),
    width: asset.width,
    height: asset.height,
    duration: asset.duration ?? null,
    creation_time: asset.creationTime,
    size: dest.size,
    has_poster: 0,
    added_at: Date.now(),
  };

  if (row.media_type === 'video') {
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(srcUri);
      await encryptFile(thumb.uri, vaultFile(id, true));
      deleteQuiet(new File(thumb.uri));
      if (!row.width && thumb.width) row.width = thumb.width;
      if (!row.height && thumb.height) row.height = thumb.height;
      row.has_poster = 1;
    } catch {
      // Poster is optional — the grid falls back to the video badge.
    }
  }

  insertVaultRow(row);

  try {
    await MediaLibrary.deleteAssetsAsync([asset.id]);
  } catch {
    // The system refused (user cancelled the delete dialog…). Roll the vault
    // copy back unless the original is somehow already gone.
    if (await assetStillExists(asset.id)) {
      deleteVaultEntry(id, row.filename, row.media_type);
      return false;
    }
  }

  purgeAssetMetadata([asset.id]);
  return true;
}

/**
 * Encrypts the given gallery assets into the vault and removes them from the
 * system media library. Runs per asset so one failure doesn't abort the batch.
 */
export async function importToVault(
  assets: PhotoAsset[],
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult> {
  ensureVaultDirectories();
  let imported = 0;
  let failed = 0;
  const total = assets.length;
  onProgress?.(0, total);
  for (const asset of assets) {
    try {
      if (await importOne(asset)) imported++;
      else failed++;
    } catch {
      failed++;
    }
    onProgress?.(imported + failed, total);
  }
  return { imported, failed };
}

export function listVaultRows(): VaultAssetRow[] {
  return db.getAllSync<VaultAssetRow>(
    'SELECT id, media_type, filename, width, height, duration, creation_time, size, has_poster, added_at FROM vault_assets ORDER BY added_at DESC'
  );
}

export function getVaultCount(): number {
  return db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM vault_assets')?.count ?? 0;
}

/** Items still using the legacy hide-only mechanism (ids into the media store). */
export function getLegacyLockedCount(): number {
  return getLockedIdList().length;
}

/** Decrypts a vault file into the session cache and returns its file URI. */
async function ensureDecrypted(row: VaultAssetRow, kind: 'full' | 'poster'): Promise<string> {
  const target = cacheFile(row, kind);
  if (target.exists) return target.uri;
  await decryptFile(vaultFile(row.id, kind === 'poster'), target);
  return target.uri;
}

/** Lazily decrypts a vault video for playback (viewer). */
export async function resolveVaultPlayback(vaultId: string): Promise<string> {
  const row = getVaultRow(vaultId);
  if (!row) throw new Error('vault: unknown asset');
  return ensureDecrypted(row, 'full');
}

/**
 * Builds grid-ready assets for the Locked Folder: photos decrypt fully,
 * videos only their poster frame. The playable file resolves on demand in
 * the viewer (see `resolveVaultPlayback`).
 */
export async function loadVaultGridAssets(): Promise<PhotoAsset[]> {
  const rows = listVaultRows();
  const assets: PhotoAsset[] = [];
  for (const row of rows) {
    let uri = '';
    try {
      if (row.media_type === 'video') {
        if (row.has_poster) uri = await ensureDecrypted(row, 'poster');
      } else {
        uri = await ensureDecrypted(row, 'full');
      }
    } catch {
      // Undecryptable row — keep it listed with a blank cell rather than
      // hiding the user's item.
    }
    assets.push({
      id: row.id,
      uri,
      filename: row.filename,
      mediaType: row.media_type,
      width: row.width,
      height: row.height,
      creationTime: row.creation_time,
      modificationTime: row.added_at,
      duration: row.duration ?? undefined,
      vaultId: row.id,
    });
  }
  return assets;
}

/** Moves vault items back into the system media library (decrypted). */
export async function exportFromVault(ids: string[]): Promise<ExportResult> {
  let exported = 0;
  let failed = 0;
  for (const id of ids) {
    const row = getVaultRow(id);
    if (!row) {
      failed++;
      continue;
    }
    try {
      const uri = await ensureDecrypted(row, 'full');
      await MediaLibrary.saveToLibraryAsync(uri);
      deleteVaultEntry(id, row.filename, row.media_type);
      purgeAssetMetadata([id]);
      exported++;
    } catch {
      failed++;
    }
  }
  return { exported, failed };
}

/** Permanently deletes encrypted vault items. */
export function deleteFromVault(ids: string[]): void {
  for (const id of ids) {
    deleteVaultEntry(id);
    purgeAssetMetadata([id]);
  }
}

/**
 * One-time migration: turns legacy hide-only locked items (ids into the
 * media store, still visible in the system gallery) into encrypted vault
 * items. `importToVault` already purges the legacy `locked_assets` rows.
 */
export async function migrateLegacyLocked(
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult> {
  const ids = getLockedIdList();
  if (ids.length === 0) return { imported: 0, failed: 0 };
  const assets = await fetchAssetsByIds(ids);
  return importToVault(assets, onProgress);
}
