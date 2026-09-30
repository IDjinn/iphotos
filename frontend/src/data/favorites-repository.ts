import { db } from './db';

/** Asset ids favorited by the user, newest action first. */
export function listFavoriteIds(): string[] {
  const rows = db.getAllSync<{ asset_id: string }>('SELECT asset_id FROM favorites ORDER BY created_at DESC');
  return rows.map((r) => r.asset_id);
}

export function isFavorite(assetId: string): boolean {
  return db.getFirstSync<{ asset_id: string }>('SELECT asset_id FROM favorites WHERE asset_id = ?', [assetId]) != null;
}

export function addFavorites(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const now = Date.now();
  db.withTransactionSync(() => {
    for (const id of assetIds) {
      db.runSync('INSERT OR IGNORE INTO favorites (asset_id, created_at) VALUES (?, ?)', [id, now]);
    }
  });
}

export function removeFavorites(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const placeholders = assetIds.map(() => '?').join(',');
  db.runSync(`DELETE FROM favorites WHERE asset_id IN (${placeholders})`, assetIds);
}
