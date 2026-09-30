import { db } from './db';
import type { AlbumRecord } from './types';

interface AlbumRow {
  id: string;
  title: string;
  created_at: number;
  cover_asset_id: string | null;
  item_count: number;
}

function rowToAlbum(row: AlbumRow): AlbumRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    coverAssetId: row.cover_asset_id ?? undefined,
    itemCount: row.item_count,
  };
}

export function listAlbums(): AlbumRecord[] {
  const rows = db.getAllSync<AlbumRow>(`
    SELECT a.id, a.title, a.created_at, a.cover_asset_id,
           (SELECT COUNT(*) FROM album_items ai WHERE ai.album_id = a.id) AS item_count
    FROM albums a
    ORDER BY a.created_at DESC
  `);
  return rows.map(rowToAlbum);
}

export function getAlbum(id: string): AlbumRecord | null {
  const row = db.getFirstSync<AlbumRow>(`
    SELECT a.id, a.title, a.created_at, a.cover_asset_id,
           (SELECT COUNT(*) FROM album_items ai WHERE ai.album_id = a.id) AS item_count
    FROM albums a WHERE a.id = ?
  `, [id]);
  return row ? rowToAlbum(row) : null;
}

export function createAlbum(title: string): AlbumRecord {
  const id = `album-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  db.runSync('INSERT INTO albums (id, title, created_at) VALUES (?, ?, ?)', [id, title, createdAt]);
  return { id, title, createdAt, itemCount: 0 };
}

export function renameAlbum(id: string, title: string): void {
  db.runSync('UPDATE albums SET title = ? WHERE id = ?', [title, id]);
}

export function deleteAlbum(id: string): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM album_items WHERE album_id = ?', [id]);
    db.runSync('DELETE FROM albums WHERE id = ?', [id]);
  });
}

export function getAlbumAssetIds(albumId: string): string[] {
  const rows = db.getAllSync<{ asset_id: string }>(
    'SELECT asset_id FROM album_items WHERE album_id = ? ORDER BY added_at DESC',
    [albumId]
  );
  return rows.map((r) => r.asset_id);
}

export function addAssetsToAlbum(albumId: string, assetIds: string[]): number {
  if (assetIds.length === 0) return 0;
  const now = Date.now();
  const before = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM album_items WHERE album_id = ?', [albumId])!.n;
  db.withTransactionSync(() => {
    for (const assetId of assetIds) {
      db.runSync('INSERT OR IGNORE INTO album_items (album_id, asset_id, added_at) VALUES (?, ?, ?)', [
        albumId,
        assetId,
        now,
      ]);
    }
  });
  const after = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM album_items WHERE album_id = ?', [albumId])!.n;
  // Keep a cover for empty albums that just gained items.
  const cover = db.getFirstSync<{ cover_asset_id: string | null }>('SELECT cover_asset_id FROM albums WHERE id = ?', [albumId]);
  if (cover && !cover.cover_asset_id && after > 0) {
    db.runSync('UPDATE albums SET cover_asset_id = ? WHERE id = ?', [assetIds[0], albumId]);
  }
  return after - before;
}

export function removeAssetsFromAlbum(albumId: string, assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const placeholders = assetIds.map(() => '?').join(',');
  db.runSync(`DELETE FROM album_items WHERE album_id = ? AND asset_id IN (${placeholders})`, [albumId, ...assetIds]);
}
