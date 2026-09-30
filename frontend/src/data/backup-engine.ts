import { ApiError } from '@/data/api-client';
import {
  listAllContentHashes,
  pollUntilDone,
  uploadPhoto,
  type CloudPhoto,
} from '@/data/cloud-photos-repository';
import { hashPendingItems, runInventoryScan } from '@/data/backup-inventory';
import {
  getQueuedRows,
  getUploadedHashes,
  markExcluded,
  markFailed,
  markUploadStarted,
  markUploaded,
  markUploadedByHashes,
} from '@/data/backup-inventory-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import { prepareForUpload } from '@/data/upload-prepare';
import type { PhotoAsset } from '@/data/types';

/**
 * Backup engine v2 — docs/plans/03-backup-e2e.md stages 03A + doc 09 §4.
 * Server-trusted model (decision D11): plaintext uploads deduplicated by the
 * SHA-256 cached in the local `backup_inventory` table. The full backend
 * listing is only fetched once, to seed the inventory after a reinstall or
 * on a new device; afterwards dedup is fully local.
 */

const UPLOAD_BATCH = 100;

export interface BackupProgress {
  phase: 'inventory' | 'hashing' | 'uploading' | 'done' | 'error';
  total: number;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  current?: string;
  error?: string;
}

async function confirmProcessed(photo: CloudPhoto): Promise<void> {
  // The worker picks jobs up within ~2s; a timeout is not an upload failure.
  await pollUntilDone(photo.id, { timeoutMs: 60_000, intervalMs: 2_500 }).catch(() => undefined);
}

/**
 * Uploads every local photo not yet backed up, deduplicating against the
 * inventory hashes (and, once per install, the server's). Returns the final
 * progress. Skips: hashes already uploaded, server-side duplicates, locked
 * items (kept out of the inventory by the scan) and unsupported formats.
 */
export async function runBackup(onProgress: (progress: BackupProgress) => void): Promise<BackupProgress> {
  let progress: BackupProgress = {
    phase: 'inventory',
    total: 0,
    processed: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
  };
  const report = (next: Partial<BackupProgress>) => {
    progress = { ...progress, ...next };
    onProgress(progress);
  };

  await runInventoryScan((scan) => report({ phase: 'inventory', processed: scan.scanned, total: scan.total }));
  await hashPendingItems((hashing) => report({ phase: 'hashing', processed: hashing.hashed, total: hashing.total }));

  // Seed the local dedup set when the inventory has no upload history yet
  // (reinstall / new device): hashes the server already knows are matched
  // against queued items so only genuinely new content is transferred.
  let uploadedHashes = getUploadedHashes();
  if (uploadedHashes.size === 0 && getQueuedRows().length > 0) {
    try {
      const serverHashes = await listAllContentHashes();
      markUploadedByHashes(serverHashes);
      uploadedHashes = getUploadedHashes();
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        report({ phase: 'error', error: 'Could not reach the cloud service — check your connection.' });
        return progress;
      }
      throw error;
    }
  }

  const queue = getQueuedRows();
  report({ phase: 'uploading', total: queue.length, processed: 0 });
  let consecutiveFailures = 0;

  for (let i = 0; i < queue.length; i += UPLOAD_BATCH) {
    const batch = queue.slice(i, i + UPLOAD_BATCH);
    const assets = await fetchAssetsByIds(batch.map((row) => row.asset_id));
    const byId = new Map<string, PhotoAsset>(assets.map((asset) => [asset.id, asset]));

    for (const row of batch) {
      if (consecutiveFailures >= 5) {
        report({ phase: 'error', error: 'Too many failures in a row — backup stopped. Try again later.' });
        return progress;
      }
      const asset = byId.get(row.asset_id);
      if (!asset) {
        // Deleted between scan and upload — the next scan prunes the row.
        markExcluded(row.asset_id, null);
        report({ skipped: progress.skipped + 1, processed: progress.processed + 1 });
        continue;
      }
      report({ current: asset.filename, processed: progress.processed + 1 });

      if (row.content_hash && uploadedHashes.has(row.content_hash)) {
        markUploaded(row.asset_id, row.content_hash, null);
        report({ skipped: progress.skipped + 1 });
        continue;
      }

      const prepared = await prepareForUpload(asset);
      if (!prepared) {
        markExcluded(row.asset_id, 'unsupported format');
        report({ skipped: progress.skipped + 1 });
        consecutiveFailures = 0;
        continue;
      }

      try {
        markUploadStarted(row.asset_id);
        const outcome = await uploadPhoto(prepared.uri, {
          fileName: prepared.fileName,
          mimeType: prepared.mimeType,
        });
        if (outcome.photo.contentHash) uploadedHashes.add(outcome.photo.contentHash);
        await confirmProcessed(outcome.photo);
        markUploaded(row.asset_id, outcome.photo.contentHash ?? row.content_hash, outcome.photo.id);
        if (outcome.duplicated) {
          report({ skipped: progress.skipped + 1 });
        } else {
          report({ uploaded: progress.uploaded + 1 });
        }
        consecutiveFailures = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed.';
        markFailed(row.asset_id, message);
        if (error instanceof ApiError && (error.status === 413 || error.status === 401)) {
          report({ phase: 'error', failed: progress.failed + 1, error: error.message });
          return progress;
        }
        report({ failed: progress.failed + 1 });
        consecutiveFailures += 1;
      }
    }
  }

  report({ phase: 'done', current: undefined });
  return progress;
}
