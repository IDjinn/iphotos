import type { GridItem } from './grouping';

/** Item heights for the flat grid list — must mirror the styled components. */
export interface ItemHeights {
  /** MonthWrap height (see `monthHeaderHeight` in GridHeaders.styles.ts). */
  monthHeaderHeight: number;
  /** DayWrap height (see `dayHeaderHeight` in GridHeaders.styles.ts). */
  dayHeaderHeight: number;
  /** Row height = cell size + the row's bottom gap margin. */
  rowHeight: number;
}

export interface MonthMarker {
  /** Index of the month header in the flat GridItem list. */
  itemIndex: number;
  /** Y offset of the header's top edge within the scroll content. */
  offset: number;
  key: string;
  label: string;
}

export interface GridLayoutMetrics {
  /** Prefix-sum top offsets, parallel to the GridItem list. */
  offsets: number[];
  contentHeight: number;
  /** Month headers in scroll order. */
  months: MonthMarker[];
}

/**
 * Computes per-item Y offsets for the flat grid item list, powering the
 * fast-scroll thumb mapping and month snapping.
 */
export function computeGridLayout(items: GridItem[], heights: ItemHeights): GridLayoutMetrics {
  const offsets: number[] = new Array(items.length);
  const months: MonthMarker[] = [];
  let y = 0;
  for (let i = 0; i < items.length; i += 1) {
    offsets[i] = y;
    const item = items[i];
    if (item.kind === 'month') {
      months.push({ itemIndex: i, offset: y, key: item.key, label: item.label });
      y += heights.monthHeaderHeight;
    } else if (item.kind === 'day') {
      y += heights.dayHeaderHeight;
    } else {
      y += heights.rowHeight;
    }
  }
  return { offsets, contentHeight: y, months };
}

/**
 * Month whose header governs `offset` — the last header at or above it.
 * Offsets before the first header resolve to the first month.
 */
export function monthAtOffset(metrics: GridLayoutMetrics, offset: number): MonthMarker | null {
  const { months } = metrics;
  if (months.length === 0) return null;
  let low = 0;
  let high = months.length - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (months[mid].offset <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return months[result];
}
