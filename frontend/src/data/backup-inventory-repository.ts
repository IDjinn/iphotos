import { db, kv } from './db';

/**
 * Local backup inventory — docs/plans/03-backup-e2e.md §3.1 (stage 03A).
 * One row per device photo: cached SHA-256 (`content_hash`), size+mtime for
 * cache validity, the MediaStore folder id for future sync rules (doc 04),
 * and the backup state machine (doc 03 §4).
 */

export type InventoryState =
  | 'pending'
  | 'hashing'
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'excluded';

export interface InventoryRow {
  asset_id: string;
  content_hash: string | null;
  size_bytes: number;
  mtime_ms: number;
  folder: string | null;
  state: InventoryState;
  blob_key: string | null;
  attempts: number;
  last_error: string | null;
  uploaded_at: number | null;
}

export interface InventoryStats {
  byState: Record<InventoryState, number>;
  totalItems: number;
  totalBytes: number;
  /** Bytes of items already uploaded — the part of the library that is safe. */
  uploadedBytes: number;
  /** Bytes of items waiting to be hashed or uploaded. */
  pendingBytes: number;
}

export interface ScanEntry {
  assetId: string;
  sizeBytes: number;
  mtimeMs: number;
  folder: string | null;
  /** Folder is out of the backup cycle (rule or awaiting decision, doc 04). */
  folderExcluded?: boolean;
  exclusionReason?: string | null;
}

const LEGACY_UPLOADED_IDS_KEY = 'backup.uploadedIds.v1';
const MIGRATED_IDS_FLAG = 'backup.inventory.migratedIds.v1';

/**
 * One-time migration from the v1 engine: asset ids tracked in kv become
 * inventory rows with `state='uploaded'`. Size/mtime stay 0 so the next scan
 * fills them (0 never matches a real file, forcing a metadata refresh) while
 * the uploaded state is preserved — nothing is re-uploaded.
 */
export function migrateUploadedIdsToInventory(): void {
  if (kv.get(MIGRATED_IDS_FLAG)) return;
  const raw = kv.get(LEGACY_UPLOADED_IDS_KEY);
  if (raw) {
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        db.withTransactionSync(() => {
          for (const id of ids) {
            db.runSync(
              'INSERT OR IGNORE INTO backup_inventory (asset_id, size_bytes, mtime_ms, state) VALUES (?, 0, 0, ?)',
              [id, 'uploaded']
            );
          }
        });
      }
    } catch {
      // Malformed legacy payload — the flag below still retires the key.
    }
  }
  kv.remove(LEGACY_UPLOADED_IDS_KEY);
  kv.set(MIGRATED_IDS_FLAG, '1');
}

const EMPTY_STATS: InventoryStats = {
  byState: { pending: 0, hashing: 0, queued: 0, uploading: 0, uploaded: 0, failed: 0, excluded: 0 },
  totalItems: 0,
  totalBytes: 0,
  uploadedBytes: 0,
  pendingBytes: 0,
};

export function getInventoryStats(): InventoryStats {
  const rows = db.getAllSync<{ state: InventoryState; count: number; bytes: number }>(
    'SELECT state, COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM backup_inventory GROUP BY state'
  );
  const stats: InventoryStats = {
    ...EMPTY_STATS,
    byState: { ...EMPTY_STATS.byState },
  };
  for (const row of rows) {
    stats.byState[row.state] = row.count;
    stats.totalItems += row.count;
    stats.totalBytes += row.bytes;
    if (row.state === 'uploaded') stats.uploadedBytes += row.bytes;
    if (row.state === 'pending' || row.state === 'hashing' || row.state === 'queued' || row.state === 'uploading') {
      stats.pendingBytes += row.bytes;
    }
  }
  return stats;
}

export interface ScanUpsertResult {
  added: number;
  changed: number;
}

/** Per-folder rollup of the inventory — feeds the backup folders screen (doc 04 §3). */
export interface FolderStat {
  folder: string;
  items: number;
  bytes: number;
  uploaded: number;
  uploadedBytes: number;
  outOfCycle: number;
  waiting: number;
}

/**
 * Cached rollup so opening the folders screen is instant even with 50k rows —
 * it never scans the media library. Short TTL covers drift while a backup is
 * running; scans and rule changes invalidate explicitly.
 */
const FOLDER_STATS_TTL_MS = 10_000;
let folderStatsCache: { at: number; data: FolderStat[] } | null = null;

export function getFolderStats(): FolderStat[] {
  if (folderStatsCache && Date.now() - folderStatsCache.at < FOLDER_STATS_TTL_MS) return folderStatsCache.data;
  const rows = db.getAllSync<
    { folder: string; items: number; bytes: number; uploaded: number; uploadedBytes: number; outOfCycle: number; waiting: number }
  >(
    `SELECT folder,
            COUNT(*) AS items,
            COALESCE(SUM(size_bytes), 0) AS bytes,
            SUM(CASE WHEN state = 'uploaded' THEN 1 ELSE 0 END) AS uploaded,
            COALESCE(SUM(CASE WHEN state = 'uploaded' THEN size_bytes ELSE 0 END), 0) AS uploadedBytes,
            SUM(CASE WHEN state = 'excluded' THEN 1 ELSE 0 END) AS outOfCycle,
            SUM(CASE WHEN state IN ('pending', 'hashing', 'queued', 'uploading', 'failed') THEN 1 ELSE 0 END) AS waiting
     FROM backup_inventory
     WHERE folder IS NOT NULL
     GROUP BY folder`
  );
  const data = rows.map((row) => ({ ...row }));
  folderStatsCache = { at: Date.now(), data };
  return data;
}

export function invalidateFolderStats(): void {
  folderStatsCache = null;
}
/**
 * Reconciles one scan batch with the inventory: new assets become `pending`
 * (or `excluded` when the folder is out of the cycle); assets whose size+mtime
 * changed go back to `pending` with a cleared hash (the bytes changed, so the
 * old hash is void); unchanged assets only get their folder refreshed — their
 * cached hash is never recomputed. Rows in an excluded folder stay out of the
 * cycle: already-uploaded ones keep their state (blobs remain in the cloud),
 * in-cycle ones are pulled out with the folder's exclusion reason.
 */
export function upsertFromScan(entries: ScanEntry[]): ScanUpsertResult {
  if (entries.length === 0) return { added: 0, changed: 0 };
  const result: ScanUpsertResult = { added: 0, changed: 0 };
  db.withTransactionSync(() => {
    for (const entry of entries) {
      const existing = db.getFirstSync<
        Pick<InventoryRow, 'size_bytes' | 'mtime_ms' | 'state'>
      >('SELECT size_bytes, mtime_ms, state FROM backup_inventory WHERE asset_id = ?', [entry.assetId]);
      if (!existing) {
        const excluded = entry.folderExcluded === true;
        db.runSync(
          'INSERT INTO backup_inventory (asset_id, size_bytes, mtime_ms, folder, state, last_error) VALUES (?, ?, ?, ?, ?, ?)',
          [entry.assetId, entry.sizeBytes, entry.mtimeMs, entry.folder, excluded ? 'excluded' : 'pending', excluded ? (entry.exclusionReason ?? null) : null]
        );
        result.added += 1;
        continue;
      }
      const changed = existing.size_bytes !== entry.sizeBytes || existing.mtime_ms !== entry.mtimeMs;
      if (entry.folderExcluded) {
        if (existing.state === 'uploaded') {
          // Out of the cycle; a changed file voids the cached hash so a future
          // re-include re-hashes the new bytes instead of deduping against them.
          if (changed) {
            db.runSync(
              `UPDATE backup_inventory
               SET size_bytes = ?, mtime_ms = ?, folder = ?, content_hash = NULL
               WHERE asset_id = ?`,
              [entry.sizeBytes, entry.mtimeMs, entry.folder, entry.assetId]
            );
            result.changed += 1;
          } else {
            db.runSync('UPDATE backup_inventory SET folder = ? WHERE asset_id = ?', [entry.folder, entry.assetId]);
          }
        } else if (existing.state !== 'excluded') {
          db.runSync(
            `UPDATE backup_inventory
             SET size_bytes = ?, mtime_ms = ?, folder = ?, state = 'excluded', last_error = ?,
                 content_hash = CASE WHEN ? THEN content_hash ELSE NULL END
             WHERE asset_id = ?`,
            [entry.sizeBytes, entry.mtimeMs, entry.folder, entry.exclusionReason ?? null, changed ? 0 : 1, entry.assetId]
          );
          result.changed += 1;
        } else {
          db.runSync('UPDATE backup_inventory SET folder = ? WHERE asset_id = ?', [entry.folder, entry.assetId]);
        }
        continue;
      }
      if (changed && existing.state !== 'excluded') {
        // Excluded stays excluded even when the file changes — folder rules
        // (doc 04) own that state, not file churn.
        db.runSync(
          `UPDATE backup_inventory
           SET size_bytes = ?, mtime_ms = ?, folder = ?, content_hash = NULL, state = 'pending', last_error = NULL
           WHERE asset_id = ?`,
          [entry.sizeBytes, entry.mtimeMs, entry.folder, entry.assetId]
        );
        result.changed += 1;
      } else {
        db.runSync('UPDATE backup_inventory SET folder = ? WHERE asset_id = ?', [entry.folder, entry.assetId]);
      }
    }
  });
  return result;
}

/** Deletes inventory rows for assets no longer present on the device. */
export function removeAbsent(presentAssetIds: Set<string>): void {
  db.execSync('CREATE TEMP TABLE IF NOT EXISTS scan_present (asset_id TEXT PRIMARY KEY NOT NULL)');
  db.execSync('DELETE FROM scan_present');
  const ids = [...presentAssetIds];
  db.withTransactionSync(() => {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      db.runSync(
        `INSERT OR IGNORE INTO scan_present (asset_id) VALUES ${chunk.map(() => '(?)').join(',')}`,
        chunk
      );
    }
  });
  db.execSync('DELETE FROM backup_inventory WHERE asset_id NOT IN (SELECT asset_id FROM scan_present)');
  db.execSync('DELETE FROM scan_present');
}

/**
 * Resets rows stranded mid-hash/mid-upload by a crash or app kill. Uploading
 * rows already had their hash, so they return straight to the queue instead
 * of being re-hashed.
 */
export function recoverTransientStates(): void {
  db.execSync("UPDATE backup_inventory SET state = 'pending' WHERE state = 'hashing'");
  db.execSync("UPDATE backup_inventory SET state = 'queued' WHERE state = 'uploading'");
}

export interface HashTarget {
  asset_id: string;
  state: InventoryState;
}

/**
 * Items that still need a content hash: `pending` ones, plus `uploaded` rows
 * migrated from the v1 kv list that never had their hash computed.
 * Newest first.
 */
export function getHashTargets(): HashTarget[] {
  return db.getAllSync<HashTarget>(
    `SELECT asset_id, state FROM backup_inventory
     WHERE state = 'pending' OR (state = 'uploaded' AND content_hash IS NULL)
     ORDER BY mtime_ms DESC`
  );
}

export function setContentHash(assetId: string, hash: string): void {
  // `uploaded` rows only gain hash knowledge (dedup); pending ones become queueable.
  db.runSync(
    `UPDATE backup_inventory
     SET content_hash = ?, state = CASE WHEN state = 'pending' OR state = 'hashing' THEN 'queued' ELSE state END
     WHERE asset_id = ?`,
    [hash, assetId]
  );
}

export function markHashing(assetId: string): void {
  db.runSync("UPDATE backup_inventory SET state = 'hashing' WHERE asset_id = ?", [assetId]);
}

export function markUploadStarted(assetId: string): void {
  db.runSync("UPDATE backup_inventory SET state = 'uploading' WHERE asset_id = ?", [assetId]);
}

export function markUploaded(assetId: string, contentHash: string | null, photoId: string | null): void {
  db.runSync(
    `UPDATE backup_inventory
     SET state = 'uploaded', content_hash = COALESCE(?, content_hash), blob_key = ?, attempts = 0,
         last_error = NULL, uploaded_at = ?
     WHERE asset_id = ?`,
    [contentHash, photoId, Date.now(), assetId]
  );
}

export function markFailed(assetId: string, error: string): void {
  db.runSync(
    `UPDATE backup_inventory SET state = 'failed', attempts = attempts + 1, last_error = ? WHERE asset_id = ?`,
    [error, assetId]
  );
}

/** Permanently out of the backup cycle (unsupported format, folder rule…). */
export function markExcluded(assetId: string, reason: string | null): void {
  db.runSync("UPDATE backup_inventory SET state = 'excluded', last_error = ? WHERE asset_id = ?", [
    reason,
    assetId,
  ]);
}

/** Hashes of everything already uploaded — the local dedup set. */
export function getUploadedHashes(): Set<string> {
  const rows = db.getAllSync<{ content_hash: string }>(
    "SELECT DISTINCT content_hash FROM backup_inventory WHERE state = 'uploaded' AND content_hash IS NOT NULL"
  );
  return new Set(rows.map((r) => r.content_hash));
}

/**
 * Marks every not-yet-uploaded row whose hash the server already knows as
 * `uploaded` — seeds the inventory after a reinstall or on a new device.
 */
export function markUploadedByHashes(hashes: Set<string>): number {
  if (hashes.size === 0) return 0;
  const values = [...hashes];
  let marked = 0;
  db.withTransactionSync(() => {
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const res = db.runSync(
        `UPDATE backup_inventory
         SET state = 'uploaded', uploaded_at = COALESCE(uploaded_at, ?), attempts = 0, last_error = NULL
         WHERE content_hash IN (${placeholders}) AND state IN ('pending', 'hashing', 'queued')`,
        [Date.now(), ...chunk]
      );
      marked += res.changes;
    }
  });
  return marked;
}

/** Items in `queued` state, newest first — the upload worklist. */
export function getQueuedRows(): { asset_id: string; content_hash: string | null }[] {
  return db.getAllSync<{ asset_id: string; content_hash: string | null }>(
    "SELECT asset_id, content_hash FROM backup_inventory WHERE state = 'queued' ORDER BY mtime_ms DESC"
  );
}

export function resetInventory(): void {
  db.execSync('DELETE FROM backup_inventory');
}

migrateUploadedIdsToInventory();
