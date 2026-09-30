import { File } from 'expo-file-system';

import {
  getHashTargets,
  markExcluded,
  markFailed,
  markHashing,
  recoverTransientStates,
  removeAbsent,
  setContentHash,
  upsertFromScan,
  type ScanEntry,
} from './backup-inventory-repository';
import { sha256File } from './file-hash';
import { getLockedIds } from './locked-repository';
import { fetchAssetsByIds, forEachFolderAsset, listDeviceFolders } from './media-repository';
import { prepareForUpload } from './upload-prepare';

/**
 * Inventory scan service — docs/plans/03-backup-e2e.md §3.2 (stage 03A).
 * `runInventoryScan` walks the media store folder by folder recording
 * size+mtime metadata (no hashing — cheap, safe on every open);
 * `hashPendingItems` computes the cached SHA-256 in batches. Photos only:
 * the backup engine and the backend accept images exclusively.
 */

export interface ScanProgress {
  scanned: number;
  total: number;
}

/** Size in bytes via the file handle; 0 when the store URI is unreadable. */
function fileSizeOf(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Full metadata scan: upserts every unlocked photo (folder attribution
 * included) and drops rows for assets that left the device. Network-free.
 * Smart albums overlap, so an asset in several albums keeps the last folder
 * seen — acceptable for 03A; doc 04 §2.1 revisits the folder key.
 */
export async function runInventoryScan(onProgress?: (progress: ScanProgress) => void): Promise<void> {
  recoverTransientStates();
  const lockedIds = getLockedIds();
  const folders = await listDeviceFolders();
  const total = folders.reduce((sum, folder) => sum + folder.assetCount, 0);
  const present = new Set<string>();
  let scanned = 0;
  onProgress?.({ scanned, total });

  for (const folder of folders) {
    await forEachFolderAsset(folder.id, (assets) => {
      const entries: ScanEntry[] = [];
      for (const asset of assets) {
        if (asset.mediaType !== 'photo' || lockedIds.has(asset.id)) continue;
        present.add(asset.id);
        entries.push({
          assetId: asset.id,
          sizeBytes: fileSizeOf(asset.uri),
          mtimeMs: asset.modificationTime,
          folder: folder.id,
        });
      }
      upsertFromScan(entries);
      scanned += assets.length;
      onProgress?.({ scanned, total });
    });
  }

  removeAbsent(present);
}

export interface HashProgress {
  hashed: number;
  total: number;
}

/**
 * Computes the cached content hash for every item that lacks one. The hash
 * covers the exact bytes that would be uploaded (HEIC is transcoded first),
 * so its validity is keyed on the original's size+mtime. Batches yield to
 * the JS thread between pages; `shouldStop` cancels between items.
 */
export async function hashPendingItems(
  onProgress?: (progress: HashProgress) => void,
  shouldStop?: () => boolean
): Promise<void> {
  const targets = getHashTargets();
  const total = targets.length;
  let hashed = 0;
  onProgress?.({ hashed, total });

  const BATCH = 50;
  for (let i = 0; i < targets.length; i += BATCH) {
    if (shouldStop?.()) return;
    const batch = targets.slice(i, i + BATCH);
    const assets = await fetchAssetsByIds(batch.map((t) => t.asset_id));
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const target of batch) {
      if (shouldStop?.()) return;
      const asset = byId.get(target.asset_id);
      if (!asset) {
        // Left the library between scan and hash — next scan prunes the row.
        hashed += 1;
        continue;
      }
      markHashing(target.asset_id);
      const prepared = await prepareForUpload(asset);
      if (!prepared) {
        markExcluded(target.asset_id, 'unsupported format');
        hashed += 1;
        onProgress?.({ hashed, total });
        continue;
      }
      const hash = await sha256File(prepared.uri);
      if (hash) {
        setContentHash(target.asset_id, hash);
      } else {
        markFailed(target.asset_id, 'could not read the file');
      }
      hashed += 1;
      onProgress?.({ hashed, total });
    }
  }
}
