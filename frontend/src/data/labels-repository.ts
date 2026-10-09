import { db } from './db';

export interface LabelEntry {
  assetId: string;
  label: string;
}

/**
 * Where a label came from. On-device labeling is gone — labels will be
 * produced by the backend service (docs/plans/05-classificacao.md §5), which
 * syncs into this table as 'cloud'.
 */
export type LabelSource = 'cloud';

/**
 * Labels attached to assets. Nothing in the app produces labels today — the
 * repository stays as the storage contract the backend sync plugs into.
 */
export function addLabels(entries: LabelEntry[], source: LabelSource): void {
  if (entries.length === 0) return;
  db.withTransactionSync(() => {
    for (const { assetId, label } of entries) {
      db.runSync(
        'INSERT OR IGNORE INTO asset_labels (asset_id, label, score, source) VALUES (?, ?, 1, ?)',
        [assetId, label, source]
      );
    }
  });
}

/** Asset ids whose label matches the query (substring, case-insensitive). */
export function searchAssetIdsByLabel(query: string, limit = 200): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const rows = db.getAllSync<{ asset_id: string }>(
    `SELECT asset_id FROM asset_labels WHERE label LIKE ? GROUP BY asset_id LIMIT ?`,
    [`%${trimmed}%`, limit]
  );
  return rows.map((r) => r.asset_id);
}

export function countLabeledAssets(): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(DISTINCT asset_id) AS n FROM asset_labels')?.n ?? 0;
}

/** Most common labels — used for search suggestion chips. */
export function listTopLabels(limit = 6): string[] {
  const rows = db.getAllSync<{ label: string }>(
    'SELECT label, COUNT(*) AS n FROM asset_labels GROUP BY label ORDER BY n DESC LIMIT ?',
    [limit]
  );
  return rows.map((r) => r.label);
}

export interface LabelSummary {
  label: string;
  count: number;
}

/** Every label with its asset count, most used first — the full label browser. */
export function listAllLabels(limit?: number): LabelSummary[] {
  // DISTINCT so a future source adding the same label doesn't double-count.
  const base =
    'SELECT label, COUNT(DISTINCT asset_id) AS n FROM asset_labels GROUP BY label ORDER BY n DESC, label ASC';
  const rows = limit
    ? db.getAllSync<{ label: string; n: number }>(`${base} LIMIT ?`, [limit])
    : db.getAllSync<{ label: string; n: number }>(base);
  return rows.map((r) => ({ label: r.label, count: r.n }));
}

/** All asset ids carrying one exact label — the label album view (no cap). */
export function getLabelAssetIds(label: string): string[] {
  const trimmed = label.trim().toLowerCase();
  if (!trimmed) return [];
  const rows = db.getAllSync<{ asset_id: string }>(
    'SELECT DISTINCT asset_id FROM asset_labels WHERE label = ?',
    [trimmed]
  );
  return rows.map((r) => r.asset_id);
}

/** Asset ids that already carry labels from one source — the "already processed" set for incremental runs. */
export function getAssetIdsWithSource(source: LabelSource): Set<string> {
  const rows = db.getAllSync<{ asset_id: string }>('SELECT DISTINCT asset_id FROM asset_labels WHERE source = ?', [
    source,
  ]);
  return new Set(rows.map((r) => r.asset_id));
}

/** Drops every label of one source (other sources stay) — full re-label prep. */
export function deleteLabelsBySource(source: LabelSource): void {
  db.runSync('DELETE FROM asset_labels WHERE source = ?', [source]);
}
