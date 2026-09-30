import { localLabelsForPhoto } from './labeler';
import { addLabels, getAssetIdsWithSource, type LabelEntry } from '../labels-repository';
import { getLockedIds } from '../locked-repository';
import { forEachLibraryPhoto } from '../media-repository';

/** Local inference failures are cheap — retry-tolerant, so abort later than the endpoint run. */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Every photo allocates a PNG buffer chain on the JS heap (base64 string,
 * Buffer, RGBA bytes, float tensor); yielding between photos keeps Hermes
 * ahead of the churn on long runs instead of accumulating garbage.
 */
const GC_YIELD_EVERY_N_PHOTOS = 8;

export interface MlIndexProgress {
  scanned: number;
  total: number;
  labeled: number;
}

export interface MlIndexResult {
  labeled: number;
  failed: number;
  error: string | null;
  aborted: boolean;
}

/**
 * Incrementally labels every photo with the on-device CLIP model. Photos that
 * already carry an 'ml' label are skipped, so re-runs resume; the run is
 * fully offline. Locked Folder assets are never processed.
 */
export async function indexLocalMlLabels(onProgress?: (p: MlIndexProgress) => void): Promise<MlIndexResult> {
  const done = getAssetIdsWithSource('ml');
  const locked = getLockedIds();
  let total = 0;
  let scanned = 0;
  let labeled = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let lastError = '';

  await forEachLibraryPhoto(async (page, totalCount) => {
    if (total === 0 && totalCount > 0) {
      total = Math.max(0, totalCount - done.size);
      onProgress?.({ scanned, total, labeled });
    }
    for (const asset of page) {
      if (done.has(asset.id) || locked.has(asset.id)) continue;
      try {
        const labels = await localLabelsForPhoto(asset);
        if (labels.length > 0) {
          const batch: LabelEntry[] = labels.map((label) => ({ assetId: asset.id, label }));
          addLabels(batch, 'ml');
          labeled++;
          done.add(asset.id);
          consecutiveFailures = 0;
        } else {
          failed++;
          consecutiveFailures++;
          lastError = 'no labels above threshold';
        }
      } catch (err) {
        failed++;
        consecutiveFailures++;
        lastError = err instanceof Error ? err.message : 'inference failed';
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return false;
      }
      scanned++;
      if (scanned % GC_YIELD_EVERY_N_PHOTOS === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      onProgress?.({ scanned, total: Math.max(total, scanned), labeled });
    }
    return true;
  });

  const aborted = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
  const error = aborted
    ? `Stopped after ${MAX_CONSECUTIVE_FAILURES} failed photos in a row — last error: ${lastError}`
    : failed > 0
      ? `${failed} photo${failed === 1 ? '' : 's'} failed — last error: ${lastError}`
      : null;
  return { labeled, failed, error, aborted };
}
