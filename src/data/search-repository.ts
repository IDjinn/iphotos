import { db } from './db';

export function listRecentSearches(limit = 8): string[] {
  const rows = db.getAllSync<{ query: string }>(
    'SELECT query FROM recent_searches ORDER BY searched_at DESC LIMIT ?',
    [limit]
  );
  return rows.map((r) => r.query);
}

export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  db.runSync(
    'INSERT INTO recent_searches (query, searched_at) VALUES (?, ?) ON CONFLICT(query) DO UPDATE SET searched_at = excluded.searched_at',
    [trimmed, Date.now()]
  );
}

export function removeRecentSearch(query: string): void {
  db.runSync('DELETE FROM recent_searches WHERE query = ?', [query]);
}

export function clearRecentSearches(): void {
  db.runSync('DELETE FROM recent_searches');
}
