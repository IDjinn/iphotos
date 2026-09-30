import { MONTHS } from '@/utils/dates';

/** What a parsed search query resolves to. */
export interface ParsedQuery {
  raw: string;
  /** Absolute range (month/year/today/yesterday). */
  createdAfter?: number;
  createdBefore?: number;
  /** Media type filter. */
  mediaType?: 'photo' | 'video';
  /** Title substring for album matching. */
  albumMatch?: string;
  /** True when nothing structured matched — free text (AI in phase 2). */
  freeText?: boolean;
}

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/**
 * Local, offline query parser. Understands:
 *  - "photos" / "videos"
 *  - "today" / "yesterday"
 *  - "august 2026", "august", "2026"
 *  - anything else → free text (matched against album titles; semantic
 *    search arrives with the phase-2 AI pipeline).
 */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim().toLowerCase();
  if (!q) return { raw, freeText: true };

  if (q === 'photos' || q === 'photo') return { raw, mediaType: 'photo' };
  if (q === 'videos' || q === 'video') return { raw, mediaType: 'video' };

  if (q === 'today') {
    return { raw, createdAfter: startOfDay(new Date()), createdBefore: Date.now() + MS_PER_DAY };
  }
  if (q === 'yesterday') {
    const from = startOfDay(new Date()) - MS_PER_DAY;
    return { raw, createdAfter: from, createdBefore: from + MS_PER_DAY };
  }

  // "august 2026" / "august" / "2026"
  const monthIndex = MONTHS.findIndex((m) => q.startsWith(m.toLowerCase()));
  const yearMatch = q.match(/\b(\d{4})\b/);
  if (monthIndex >= 0 || yearMatch) {
    const now = new Date();
    const year = yearMatch ? parseInt(yearMatch[1], 10) : now.getFullYear();
    if (monthIndex >= 0) {
      const from = new Date(year, monthIndex, 1).getTime();
      const to = new Date(year, monthIndex + 1, 1).getTime();
      return { raw, createdAfter: from, createdBefore: to };
    }
    const from = new Date(year, 0, 1).getTime();
    const to = new Date(year + 1, 0, 1).getTime();
    return { raw, createdAfter: from, createdBefore: to };
  }

  return { raw, albumMatch: q, freeText: true };
}

/**
 * Phase-2 seam: when the AI backend lands, semantic providers will
 * implement this interface and plug into the same results UI.
 */
export interface SearchProvider {
  id: string;
  search(query: ParsedQuery): Promise<{ label: string; assetIds: string[] }[]>;
}
