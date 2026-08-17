import * as SQLite from 'expo-sqlite';

/**
 * App-local SQLite database for everything that is not media:
 * albums, favorites, locked-folder membership and settings.
 */
export const db = SQLite.openDatabaseSync('iphotos.db', { enableChangeListener: false });

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    cover_asset_id TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS album_items (
    album_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (album_id, asset_id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS favorites (
    asset_id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS locked_assets (
    asset_id TEXT PRIMARY KEY NOT NULL,
    moved_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS recent_searches (
    query TEXT PRIMARY KEY NOT NULL,
    searched_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS asset_labels (
    asset_id TEXT NOT NULL,
    label TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'local',
    PRIMARY KEY (asset_id, label, source)
  );
  CREATE INDEX IF NOT EXISTS idx_asset_labels_label ON asset_labels(label);
  `,
  `
  CREATE TABLE IF NOT EXISTS vault_assets (
    id TEXT PRIMARY KEY NOT NULL,
    media_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    duration REAL,
    creation_time INTEGER NOT NULL,
    size INTEGER NOT NULL,
    has_poster INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL
  );
  `,
];

db.execSync('PRAGMA journal_mode = WAL;');
db.execSync('PRAGMA foreign_keys = ON;');

export function migrate(): void {
  const current = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1};`);
    });
  }
}

migrate();

/** Key-value helpers used by the settings store persistence adapter. */
export const kv = {
  get(key: string): string | null {
    return db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])?.value ?? null;
  },
  set(key: string, value: string): void {
    db.runSync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
  },
  remove(key: string): void {
    db.runSync('DELETE FROM kv WHERE key = ?', [key]);
  },
};

/** Removes every trace of the given asset ids from app metadata. */
export function purgeAssetMetadata(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const placeholders = assetIds.map(() => '?').join(',');
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM album_items WHERE asset_id IN (${placeholders})`, assetIds);
    db.runSync(`DELETE FROM favorites WHERE asset_id IN (${placeholders})`, assetIds);
    db.runSync(`DELETE FROM locked_assets WHERE asset_id IN (${placeholders})`, assetIds);
    db.runSync(`DELETE FROM asset_labels WHERE asset_id IN (${placeholders})`, assetIds);
  });
}
