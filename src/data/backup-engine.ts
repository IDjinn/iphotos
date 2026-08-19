import { Buffer } from 'buffer';

import { ApiError } from '@/data/api-client';
import {
  listAllContentHashes,
  pollUntilDone,
  uploadPhoto,
  type CloudPhoto,
} from '@/data/cloud-photos-repository';
import { kv } from '@/data/db';
import { getLockedIds } from '@/data/locked-repository';
import type { PhotoAsset } from '@/data/types';

/**
 * Backup engine v1 — docs/plans/03-backup-e2e.md stage 03A + docs/plans/09-backend-api.md §4.
 * Server-trusted model (decision D11): uploads are plaintext; dedup is the
 * server-side SHA-256 (`contentHash`) matched against a local inventory.
 */

const UPLOADED_IDS_KEY = 'backup.uploadedIds.v1';
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const CONVERTIBLE_EXTENSIONS = new Set(['heic', 'heif']);

export interface BackupProgress {
  phase: 'inventory' | 'uploading' | 'done' | 'error';
  total: number;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  current?: string;
  error?: string;
}

export function getUploadedIds(): Set<string> {
  const raw = kv.get(UPLOADED_IDS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markUploaded(assetId: string): void {
  const ids = getUploadedIds();
  ids.add(assetId);
  kv.set(UPLOADED_IDS_KEY, JSON.stringify([...ids]));
}

export function resetBackupState(): void {
  kv.remove(UPLOADED_IDS_KEY);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function mimeFor(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** SHA-256 of the file bytes, matching the server-side `contentHash`. Null when unreadable. */
async function sha256File(uri: string): Promise<string | null> {
  try {
    const { File } = await import('expo-file-system');
    const { createHash } = await import('react-native-quick-crypto');
    const bytes = await new File(uri).arrayBuffer();
    return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  } catch {
    return null;
  }
}

/** HEIC/HEIF must be transcoded client-side — the backend only accepts jpeg|png|webp. */
async function prepareForUpload(asset: PhotoAsset): Promise<{ uri: string; fileName: string; mimeType: string } | null> {
  const extension = extensionOf(asset.filename);
  if (SUPPORTED_EXTENSIONS.has(extension)) {
    return { uri: asset.uri, fileName: asset.filename, mimeType: mimeFor(extension) };
  }
  if (CONVERTIBLE_EXTENSIONS.has(extension)) {
    try {
      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const result = await manipulateAsync(asset.uri, [], { format: SaveFormat.JPEG, compress: 0.92 });
      const fileName = `${asset.filename.replace(/\.[^.]+$/, '')}.jpg`;
      return { uri: result.uri, fileName, mimeType: 'image/jpeg' };
    } catch {
      return null;
    }
  }
  return null;
}

async function confirmProcessed(photo: CloudPhoto): Promise<void> {
  // The worker picks jobs up within ~2s; a timeout is not an upload failure.
  await pollUntilDone(photo.id, { timeoutMs: 60_000, intervalMs: 2_500 }).catch(() => undefined);
}

/**
 * Uploads every local photo not yet backed up. Returns the final progress.
 * Skips: already-uploaded asset ids, server-known content hashes (dedup),
 * locked-folder items and unsupported formats.
 */
export async function runBackup(onProgress: (progress: BackupProgress) => void): Promise<BackupProgress> {
  const lockedIds = getLockedIds();
  const uploadedIds = getUploadedIds();
  const pending: PhotoAsset[] = [];
  let progress: BackupProgress = { phase: 'inventory', total: 0, processed: 0, uploaded: 0, skipped: 0, failed: 0 };
  const report = (next: Partial<BackupProgress>) => {
    progress = { ...progress, ...next };
    onProgress(progress);
  };

  const { forEachLibraryPhoto } = await import('@/data/media-repository');
  await forEachLibraryPhoto((assets) => {
    for (const asset of assets) {
      if (lockedIds.has(asset.id) || asset.vaultId) continue;
      if (uploadedIds.has(asset.id)) continue;
      pending.push(asset);
    }
  });
  report({ total: pending.length });

  let serverHashes: Set<string> | null = null;
  try {
    serverHashes = await listAllContentHashes();
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      report({ phase: 'error', error: 'Could not reach the cloud service — check your connection.' });
      return progress;
    }
    throw error;
  }

  report({ phase: 'uploading' });
  let consecutiveFailures = 0;
  for (const asset of pending) {
    if (consecutiveFailures >= 5) {
      report({ phase: 'error', error: 'Too many failures in a row — backup stopped. Try again later.' });
      return progress;
    }
    report({ current: asset.filename, processed: progress.processed + 1 });

    const prepared = await prepareForUpload(asset);
    if (!prepared) {
      report({ skipped: progress.skipped + 1 });
      markUploaded(asset.id);
      consecutiveFailures = 0;
      continue;
    }

    try {
      const localHash = await sha256File(prepared.uri);
      if (localHash && serverHashes?.has(localHash)) {
        serverHashes.delete(localHash);
        report({ skipped: progress.skipped + 1 });
        markUploaded(asset.id);
        consecutiveFailures = 0;
        continue;
      }

      const outcome = await uploadPhoto(prepared.uri, {
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
      });
      if (!outcome.duplicated && outcome.photo.contentHash) serverHashes?.add(outcome.photo.contentHash);
      await confirmProcessed(outcome.photo);
      markUploaded(asset.id);
      report({ uploaded: progress.uploaded + 1 });
      consecutiveFailures = 0;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 413 || error.status === 401)) {
        report({ phase: 'error', failed: progress.failed + 1, error: error.message });
        return progress;
      }
      report({ failed: progress.failed + 1 });
      consecutiveFailures += 1;
    }
  }

  report({ phase: 'done', current: undefined });
  return progress;
}
