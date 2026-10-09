import { db, kv } from './db';
import { invalidateFolderStats } from './backup-inventory-repository';
import {
  FOLDER_HOLD_EXCLUSION_REASON,
  FOLDER_RULE_EXCLUSION_REASON,
  type FolderRuleMode,
  type NewFolderPolicy,
} from './folder-rules';

/**
 * Folder sync rules — docs/plans/04-pastas-sync-ignore.md §2/§4.
 * The `sync_rules` table holds the user's explicit per-folder include/exclude
 * choices; kv tracks which folders the scan has already decided about
 * (`knownFolders`) and which are awaiting a decision under the `ask` policy
 * (`pendingFolderDecisions`). Rule changes reconcile the affected folder's
 * inventory rows in place — already-uploaded blobs stay in the cloud (remote
 * removal with tombstones is stage 03E, doc 03 §8).
 */

const POLICY_KEY = 'backup.newFolderPolicy.v1';
const KNOWN_FOLDERS_KEY = 'backup.knownFolders.v1';
const PENDING_DECISIONS_KEY = 'backup.pendingFolderDecisions.v1';

function readJsonSet(key: string): Set<string> | null {
  const raw = kv.get(key);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeJsonSet(key: string, values: Set<string>): void {
  kv.set(key, JSON.stringify([...values]));
}

export function getNewFolderPolicy(): NewFolderPolicy {
  const raw = kv.get(POLICY_KEY);
  return raw === 'include' || raw === 'exclude' ? raw : 'ask';
}

/**
 * Folders the scan has already decided about. First call seeds from the
 * inventory, so an upgrade keeps today's behavior (everything already tracked
 * stays included) and only genuinely new folders go through the policy.
 */
export function getKnownFolders(): Set<string> {
  const known = readJsonSet(KNOWN_FOLDERS_KEY);
  if (known) return known;
  const rows = db.getAllSync<{ folder: string }>(
    'SELECT DISTINCT folder FROM backup_inventory WHERE folder IS NOT NULL'
  );
  const seeded = new Set(rows.map((r) => r.folder));
  writeJsonSet(KNOWN_FOLDERS_KEY, seeded);
  return seeded;
}

export function saveKnownFolders(folders: Set<string>): void {
  writeJsonSet(KNOWN_FOLDERS_KEY, folders);
}

export function getPendingFolderDecisions(): Set<string> {
  return readJsonSet(PENDING_DECISIONS_KEY) ?? new Set();
}

export function savePendingFolderDecisions(folders: Set<string>): void {
  writeJsonSet(PENDING_DECISIONS_KEY, folders);
}

export function listSyncRules(): Record<string, FolderRuleMode> {
  const rows = db.getAllSync<{ folder: string; mode: FolderRuleMode }>('SELECT folder, mode FROM sync_rules');
  const rules: Record<string, FolderRuleMode> = {};
  for (const row of rows) rules[row.folder] = row.mode;
  return rules;
}

export function getSyncRule(folder: string): FolderRuleMode | null {
  return (
    db.getFirstSync<{ mode: FolderRuleMode }>('SELECT mode FROM sync_rules WHERE folder = ?', [folder])?.mode ?? null
  );
}

/** Rows coming back into the cycle skip re-hashing when their hash is valid. */
function rependFolderItems(folder: string): void {
  db.runSync(
    `UPDATE backup_inventory
     SET state = CASE WHEN content_hash IS NOT NULL THEN 'queued' ELSE 'pending' END, last_error = NULL
     WHERE folder = ?
       AND state = 'excluded'
       AND (last_error IS NULL OR last_error IN (?, ?))`,
    [folder, FOLDER_RULE_EXCLUSION_REASON, FOLDER_HOLD_EXCLUSION_REASON]
  );
}

/**
 * Puts a folder's not-yet-uploaded rows out of the cycle, whatever got them
 * stuck (pending, failed…). Uploaded rows are left alone — their blobs stay
 * in the cloud and they are already out of the upload queue.
 */
function excludeFolderItems(folder: string, reason: string): void {
  db.runSync(
    `UPDATE backup_inventory
     SET state = 'excluded', last_error = ?
     WHERE folder = ? AND state IN ('pending', 'hashing', 'queued', 'uploading', 'failed')`,
    [reason, folder]
  );
}

/**
 * Persists a rule and reconciles the folder immediately (§4): include brings
 * rule-owned excluded rows back (hashed ones straight to the queue), exclude
 * pulls everything not-yet-uploaded out of the cycle.
 */
export function setSyncRule(folder: string, mode: FolderRuleMode): void {
  db.runSync(
    `INSERT INTO sync_rules (folder, mode, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(folder) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
    [folder, mode, Date.now()]
  );
  if (mode === 'include') {
    rependFolderItems(folder);
  } else {
    excludeFolderItems(folder, FOLDER_RULE_EXCLUSION_REASON);
  }
  invalidateFolderStats();
  const known = getKnownFolders();
  known.add(folder);
  saveKnownFolders(known);
  const pending = getPendingFolderDecisions();
  if (pending.delete(folder)) savePendingFolderDecisions(pending);
}

/**
 * Moves a held folder's rows out of the decision queue without a rule —
 * used when the scan itself marks a folder as awaiting decision (§5).
 */
export function holdFolderItems(folder: string): void {
  excludeFolderItems(folder, FOLDER_HOLD_EXCLUSION_REASON);
  invalidateFolderStats();
}

/** Drops every rule and scan decision — part of the sign-out cleanup. */
export function resetSyncRules(): void {
  db.runSync('DELETE FROM sync_rules');
  kv.remove(POLICY_KEY);
  kv.remove(KNOWN_FOLDERS_KEY);
  kv.remove(PENDING_DECISIONS_KEY);
}
