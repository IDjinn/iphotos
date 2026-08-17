import { dayGroupLabel, monthKey, monthLabel } from '@/utils/dates';
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
 */
export function buildGridData(assets: PhotoAsset[], columns = GRID_COLUMNS): GridData {
  const items: GridItem[] = [];
  const stickyIndices: number[] = [];
  let currentMonth = '';
  let currentDay = '';
  let rowBuffer: PhotoAsset[] = [];

  const flushRow = () => {
    if (rowBuffer.length > 0) {
      items.push({ kind: 'row', key: `row-${items.length}`, assets: rowBuffer });
      rowBuffer = [];
    }
  };

  for (const asset of assets) {
    const mKey = monthKey(asset.creationTime);
    if (mKey !== currentMonth) {
      flushRow();
      stickyIndices.push(items.length);
      items.push({ kind: 'month', key: `m-${mKey}`, label: monthLabel(asset.creationTime) });
      currentMonth = mKey;
      currentDay = '';
    }
    const dKey = `${mKey}-${new Date(asset.creationTime).getDate()}`;
    if (dKey !== currentDay) {
      flushRow();
      items.push({ kind: 'day', key: `d-${dKey}`, label: dayGroupLabel(asset.creationTime) });
      currentDay = dKey;
    }
    rowBuffer.push(asset);
    if (rowBuffer.length === columns) flushRow();
  }
  flushRow();

  return { items, stickyIndices, total: assets.length };
}
