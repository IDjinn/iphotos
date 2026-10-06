import { File } from 'expo-file-system';

import {
  getHashTargets,
  invalidateFolderStats,
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
import {
  FOLDER_HOLD_EXCLUSION_REASON,
  FOLDER_RULE_EXCLUSION_REASON,
  UNSUPPORTED_FORMAT_EXCLUSION_REASON,
  decideFolder,
} from './folder-rules';
import { getLockedIds } from './locked-repository';
import { fetchAssetsByIds, forEachFolderAsset, listDeviceFolders, type DeviceFolder } from './media-repository';
import {
  getKnownFolders,
  getNewFolderPolicy,
  getPendingFolderDecisions,
  getSyncRule,
  holdFolderItems,
  listSyncRules,
  saveKnownFolders,
  savePendingFolderDecisions,
} from './sync-rules-repository';
import { prepareForUpload } from './upload-prepare';

/**
 * Inventory scan service — docs/plans/03-backup-e2e.md §3.2 (stage 03A) and
 * docs/plans/04-pastas-sync-ignore.md §2.3 (folder rules).
 * `runInventoryScan` walks the media store folder by folder recording
 * size+mtime metadata (no hashing — cheap, safe on every open), applying the
 * folder sync rules (locked → excluded before this, explicit rule → policy →
 * default include); `hashPendingItems` computes the cached SHA-256 in batches.
 * Photos and videos are both backed up; the backend transcodes HEIC-like
 * formats and accepts the video containers it lists as supported.
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
 * Walks one folder's assets into scan entries. Excluded folders are still
 * walked (metadata-only) so their rows survive `removeAbsent` and new items
 * are recorded as already out of the cycle.
 */
async function scanFolderIntoInventory(
  folder: DeviceFolder,
  lockedIds: Set<string>,
  present: Set<string>,
  options: { folderExcluded: boolean; exclusionReason: string | null },
  onAsset?: () => void
): Promise<void> {
  await forEachFolderAsset(folder.id, (assets) => {
    const entries: ScanEntry[] = [];
    for (const asset of assets) {
      if ((asset.mediaType !== 'photo' && asset.mediaType !== 'video') || lockedIds.has(asset.id)) continue;
      present.add(asset.id);
      entries.push({
        assetId: asset.id,
        sizeBytes: fileSizeOf(asset.uri),
        mtimeMs: asset.modificationTime,
        folder: folder.id,
        folderExcluded: options.folderExcluded,
        exclusionReason: options.exclusionReason,
      });
    }
    upsertFromScan(entries);
    onAsset?.();
  });
}

/**
 * Full metadata scan: upserts every unlocked photo (folder attribution and
 * sync-rule decision included) and drops rows for assets that left the
 * device. Network-free. Smart albums overlap, so an asset in several albums
 * keeps the last folder seen — the stable folder key is the media-store
 * album id (doc 04 §2.1), consistent across scans of the same device.
 */
export async function runInventoryScan(onProgress?: (progress: ScanProgress) => void): Promise<void> {
  recoverTransientStates();
  const lockedIds = getLockedIds();
  const rules = listSyncRules();
  const policy = getNewFolderPolicy();
  const knownFolders = getKnownFolders();
  const pendingDecisions = getPendingFolderDecisions();
  const folders = await listDeviceFolders();
  const total = folders.reduce((sum, folder) => sum + folder.assetCount, 0);
  const present = new Set<string>();
  let scanned = 0;
  onProgress?.({ scanned, total });

  for (const folder of folders) {
    const action = decideFolder({
      rule: rules[folder.id] ?? null,
      isNew: !knownFolders.has(folder.id) && !pendingDecisions.has(folder.id),
      policy,
    });
    if (action === 'include') {
      await scanFolderIntoInventory(folder, lockedIds, present, { folderExcluded: false, exclusionReason: null });
      knownFolders.add(folder.id);
    } else {
      const exclusionReason = action === 'hold' ? FOLDER_HOLD_EXCLUSION_REASON : FOLDER_RULE_EXCLUSION_REASON;
      await scanFolderIntoInventory(folder, lockedIds, present, { folderExcluded: true, exclusionReason });
      if (action === 'hold') {
        pendingDecisions.add(folder.id);
        holdFolderItems(folder.id);
      } else {
        knownFolders.add(folder.id);
      }
    }
    scanned += folder.assetCount;
    onProgress?.({ scanned, total });
  }

  saveKnownFolders(knownFolders);
  savePendingFolderDecisions(pendingDecisions);
  invalidateFolderStats();
  removeAbsent(present);
}

/**
 * Re-scans a single folder after a rule change (doc 04 §4): reconciles the
 * device reality with the new decision without touching other folders and
 * without pruning absent rows (the next full scan owns that).
 */
export async function runFolderScan(folderId: string): Promise<void> {
  const lockedIds = getLockedIds();
  const folders = await listDeviceFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;
  const excluded = getSyncRule(folderId) === 'exclude';
  await scanFolderIntoInventory(folder, lockedIds, new Set<string>(), {
    folderExcluded: excluded,
    exclusionReason: excluded ? FOLDER_RULE_EXCLUSION_REASON : null,
  });
  invalidateFolderStats();
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
        markExcluded(target.asset_id, UNSUPPORTED_FORMAT_EXCLUSION_REASON);
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
