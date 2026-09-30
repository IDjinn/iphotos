import { classifyPhoto, type AiLabelerConfig } from './ai-labeler';
import { addLabels, getAssetIdsWithSource, type LabelEntry } from './labels-repository';
import { getLockedIds } from './locked-repository';
import { forEachLibraryPhoto } from './media-repository';

/** Bailing out after this many failed requests in a row avoids pushing the
 *  whole library through a broken endpoint (bad URL, expired key, no vision). */
const MAX_CONSECUTIVE_FAILURES = 5;

export interface AiIndexProgress {
  /** Photos sent to the endpoint so far this run. */
  scanned: number;
  /** Photos this run still has to process (approximate — locked/already-done excluded). */
  total: number;
  /** Photos that received at least one AI label so far this run. */
  labeled: number;
}

export interface AiIndexResult {
  labeled: number;
  failed: number;
  /** Human-readable summary of what went wrong, null on a clean run. */
  error: string | null;
  /** True when the run stopped early after repeated failures. */
  aborted: boolean;
}

/**
 * Incrementally labels every photo through the user-configured AI endpoint.
 * Photos that already carry an AI label (any previous run) are skipped, so
 * re-runs resume where the last one stopped; writes are idempotent. Locked
 * Folder assets are never sent anywhere.
 */
export async function indexAiLabels(
  config: AiLabelerConfig,
  onProgress?: (p: AiIndexProgress) => void
): Promise<AiIndexResult> {
  const done = getAssetIdsWithSource('ai');
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
        const labels = await classifyPhoto(asset, config);
        const batch: LabelEntry[] = labels.map((label) => ({ assetId: asset.id, label }));
        addLabels(batch, 'ai');
        labeled++;
        done.add(asset.id);
        consecutiveFailures = 0;
      } catch (err) {
        failed++;
        consecutiveFailures++;
        lastError = err instanceof Error ? err.message : 'request failed';
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return false;
      }
      scanned++;
      onProgress?.({ scanned, total: Math.max(total, scanned), labeled });
    }
    return true;
  });

  const error = abortedMessage(consecutiveFailures, failed, lastError);
  return { labeled, failed, error, aborted: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES };
}

function abortedMessage(consecutiveFailures: number, failed: number, lastError: string): string | null {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return `Stopped after ${MAX_CONSECUTIVE_FAILURES} failed requests in a row — check the endpoint, model and key. Last error: ${lastError}`;
  }
  if (failed > 0) {
    return `${failed} photo${failed === 1 ? '' : 's'} failed — last error: ${lastError}`;
  }
  return null;
}
