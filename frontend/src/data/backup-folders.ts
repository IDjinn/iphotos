import { getFolderStats, type FolderStat } from './backup-inventory-repository';
import type { FolderRuleMode } from './folder-rules';
import { listDeviceFolders } from './media-repository';
import { getPendingFolderDecisions, listSyncRules } from './sync-rules-repository';

/**
 * View model for the backup folders screen — docs/plans/04-pastas-sync-ignore.md §3.
 * Composes device folders with the cached inventory rollup, the persisted
 * rules and the folders still awaiting a decision. Reading it never scans
 * the media library: counts and bytes come from the inventory.
 */

export interface BackupFolderView {
  id: string;
  title: string;
  items: number;
  bytes: number;
  uploaded: number;
  uploadedBytes: number;
  waiting: number;
  outOfCycle: number;
  rule: FolderRuleMode | null;
  status: 'included' | 'excluded' | 'held' | 'missing';
}

type FolderStatFields = Omit<FolderStat, 'folder'>;

const EMPTY_STAT: FolderStatFields = {
  items: 0,
  bytes: 0,
  uploaded: 0,
  uploadedBytes: 0,
  outOfCycle: 0,
  waiting: 0,
};

function statFields(stats: FolderStat[], folderId: string): FolderStatFields {
  return stats.find((s) => s.folder === folderId) ?? EMPTY_STAT;
}

export async function getBackupFolderViews(): Promise<BackupFolderView[]> {
  const [deviceFolders, stats, rules, pending] = await Promise.all([
    listDeviceFolders(),
    Promise.resolve(getFolderStats()),
    Promise.resolve(listSyncRules()),
    Promise.resolve(getPendingFolderDecisions()),
  ]);

  const views: BackupFolderView[] = [];
  for (const folder of deviceFolders) {
    const rule = rules[folder.id] ?? null;
    const status = rule === 'exclude' ? 'excluded' : pending.has(folder.id) ? 'held' : 'included';
    views.push({ id: folder.id, title: folder.title, ...statFields(stats, folder.id), rule, status });
  }

  // Rules (or inventory rows) for folders the device no longer reports stay
  // visible as "not found" — doc 04 §6 keeps them as history.
  const seen = new Set(views.map((v) => v.id));
  for (const id of new Set([...Object.keys(rules), ...stats.map((s) => s.folder)])) {
    if (seen.has(id)) continue;
    views.push({ id, title: id, ...statFields(stats, id), rule: rules[id] ?? null, status: 'missing' });
  }

  return views.sort((a, b) => b.bytes - a.bytes || a.title.localeCompare(b.title));
}

/** Folders the user still has to decide about under the `ask` policy (§5). */
export async function getHeldFolderViews(): Promise<BackupFolderView[]> {
  const views = await getBackupFolderViews();
  return views.filter((v) => v.status === 'held');
}
