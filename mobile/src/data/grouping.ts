import { dayGroupLabel, monthKey, monthLabel, oneMonthAgoStart } from '@/utils/dates';
import { GRID_COLUMNS } from '@/theme/tokens';

import type { PhotoAsset } from './types';

export type GridItem =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'row'; key: string; assets: PhotoAsset[] };

export interface GridData {
  items: GridItem[];
  /** Indices of month headers — passed to FlashList stickyHeaderIndices. */
  stickyIndices: number[];
  total: number;
}

/**
 * Groups a newest-first asset list into flat grid items:
 * month header → day header → rows of `columns` cells.
 * Photos older than one month (see `oneMonthAgoStart`) get the month
 * header only — no per-day headers.
 */
export function buildGridData(
  assets: PhotoAsset[],
  columns = GRID_COLUMNS,
  { now = Date.now() }: { now?: number } = {}
): GridData {
  const items: GridItem[] = [];
  const stickyIndices: number[] = [];
  const dayCutoff = oneMonthAgoStart(now);
  let currentMonth = '';
  let currentDay = '';
  // The list is newest-first, so the cutoff is crossed at most once.
  let pastDayCutoff = false;
  let rowBuffer: PhotoAsset[] = [];

  const flushRow = () => {
    if (rowBuffer.length > 0) {
      items.push({ kind: 'row', key: `row-${items.length}`, assets: rowBuffer });
      rowBuffer = [];
    }
  };

  for (const asset of assets) {
    if (!pastDayCutoff && asset.creationTime < dayCutoff) pastDayCutoff = true;
    const mKey = monthKey(asset.creationTime);
    if (mKey !== currentMonth) {
      flushRow();
      stickyIndices.push(items.length);
      items.push({ kind: 'month', key: `m-${mKey}`, label: monthLabel(asset.creationTime) });
      currentMonth = mKey;
      currentDay = '';
    }
    const dKey = `${mKey}-${new Date(asset.creationTime).getDate()}`;
    if (!pastDayCutoff && dKey !== currentDay) {
      flushRow();
      items.push({ kind: 'day', key: `d-${dKey}`, label: dayGroupLabel(asset.creationTime, now) });
      currentDay = dKey;
    }
    rowBuffer.push(asset);
    if (rowBuffer.length === columns) flushRow();
  }
  flushRow();

  return { items, stickyIndices, total: assets.length };
}
