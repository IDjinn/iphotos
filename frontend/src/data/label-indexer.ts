import { kv } from './db';
import { addLabels, type LabelEntry } from './labels-repository';
import { forEachFolderAsset, getPermissionStatus, listDeviceFolders } from './media-repository';
import type { PhotoAsset } from './types';

const FOLDER_MARKERS_KEY = 'classification.folderMarkers.v1';
const BATCH_SIZE = 1000;

export interface IndexRunResult {
  /** Rows written this run (newly labeled asset/label pairs). */
  labeled: number;
  folders: number;
  /** Titles of folders that failed to read — their markers stay unset so a later run retries them. */
  errors: string[];
}

export interface IndexProgress {
  /** Assets examined so far this run. */
  scanned: number;
  /** Total assets queued across changed folders (0 when nothing to scan). */
  total: number;
}

function normalizeFolderLabel(title: string): string | null {
  const label = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return label.length > 0 && label.length <= 40 ? label : null;
}

function labelsForAsset(asset: PhotoAsset, folderLabel: string): string[] {
  const labels = [folderLabel];
  // Screenshots usually live in their own folder, but some OEMs drop them in
  // Camera/DCIM — the filename is a reliable secondary signal.
  if (/^screenshot/i.test(asset.filename)) labels.push('screenshots');
  return labels;
}

/**
 * Incrementally labels assets from their device folders (v1 heuristics — no
 * ML). Folders whose asset count is unchanged since the last run are skipped;
 * writes are idempotent (INSERT OR IGNORE), so re-runs are always safe.
 * The ML model of docs/plans/05-classificacao.md §4 replaces the label source
 * without changing this contract.
 */
export async function indexDeviceLabels(onProgress?: (p: IndexProgress) => void): Promise<IndexRunResult> {
  const permission = await getPermissionStatus();
  if (!permission.granted) return { labeled: 0, folders: 0, errors: [] };

  const markers: Record<string, number> = JSON.parse(kv.get(FOLDER_MARKERS_KEY) ?? '{}');
  const folders = await listDeviceFolders();
  const pending = folders.filter((f) => markers[f.id] !== f.assetCount);
  const total = pending.reduce((sum, f) => sum + (normalizeFolderLabel(f.title) ? f.assetCount : 0), 0);
  let scanned = 0;
  let labeled = 0;
  let batch: LabelEntry[] = [];
  const errors: string[] = [];

  const flush = () => {
    if (batch.length === 0) return;
    addLabels(batch);
    labeled += batch.length;
    batch = [];
  };

  onProgress?.({ scanned: 0, total });

  for (const folder of folders) {
    if (markers[folder.id] === folder.assetCount) continue;
    const folderLabel = normalizeFolderLabel(folder.title);
    if (folderLabel) {
      try {
        await forEachFolderAsset(folder.id, (assets) => {
          for (const asset of assets) {
            for (const label of labelsForAsset(asset, folderLabel)) {
              batch.push({ assetId: asset.id, label });
            }
          }
          scanned += assets.length;
          onProgress?.({ scanned, total });
          if (batch.length >= BATCH_SIZE) flush();
        });
      } catch {
        // Unreadable folder — keep its marker unset so a later run retries it.
        errors.push(folder.title);
        continue;
      }
    }
    markers[folder.id] = folder.assetCount;
    kv.set(FOLDER_MARKERS_KEY, JSON.stringify(markers));
  }
  flush();
  onProgress?.({ scanned, total });

  return { labeled, folders: folders.length, errors };
}
