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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface RailTick {
  /** Index into `GridLayoutMetrics.months`. */
  markerIndex: number;
  offset: number;
  label: string;
}

/** Year of a month marker key ("m-2026-09" → 2026); null for the undated bucket. */
function markerYear(key: string): number | null {
  const match = /^m-(\d{4})-\d{2}$/.exec(key);
  return match ? Number(match[1]) : null;
}

/**
 * Rail labels: every month of the current year ("Sep"), and one tick per
 * older year ("2025") at its first marker in scroll order.
 */
export function buildRailTicks(months: MonthMarker[], currentYear: number): RailTick[] {
  const ticks: RailTick[] = [];
  let lastYear: number | null = null;
  months.forEach((marker, markerIndex) => {
    const year = markerYear(marker.key);
    if (year === null) return;
    if (year === currentYear) {
      const month = Number(marker.key.slice(-2));
      ticks.push({ markerIndex, offset: marker.offset, label: MONTH_ABBR[month - 1] ?? marker.label });
    } else if (year !== lastYear) {
      ticks.push({ markerIndex, offset: marker.offset, label: String(year) });
    }
    lastYear = year;
  });
  return ticks;
}

/** Scrub bubble text: "September 2026" for the current year, just the year before it. */
export function markerBubbleLabel(marker: MonthMarker, currentYear: number): string {
  const year = markerYear(marker.key);
  return year === null || year === currentYear ? marker.label : String(year);
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

/** Index of the last item whose top edge is at or above `offset` (binary search). */
function itemIndexAtOffset(metrics: GridLayoutMetrics, offset: number): number {
  const { offsets } = metrics;
  let low = 0;
  let high = offsets.length - 1;
  let at = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= offset) {
      at = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return at;
}

/**
 * Global photo index of the first photo in the row visible at `offset` (the
 * row straddling the viewport top) — the anchor that keeps the grid in place
 * when pinch-columns re-batches the rows.
 */
export function photoAnchorAtOffset(
  items: GridItem[],
  metrics: GridLayoutMetrics,
  offset: number
): number {
  const at = itemIndexAtOffset(metrics, offset);
  let count = 0;
  for (let i = 0; i < at; i += 1) {
    const item = items[i];
    if (item.kind === 'row') count += item.assets.length;
  }
  return count;
}

/** Top offset of the row containing the given global photo index. */
export function offsetForPhotoIndex(
  items: GridItem[],
  metrics: GridLayoutMetrics,
  photoIndex: number
): number {
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== 'row') continue;
    const len = item.assets.length;
    if (photoIndex < count + len) return metrics.offsets[i];
    count += len;
  }
  return metrics.contentHeight;
}

/**
 * Full-timeline rail metrics around a loaded window (newest-first buckets):
 * months newer than the window become estimated markers above it (the
 * window is shifted down by their height → `windowOffset`), months older than
 * it estimated markers below. Heights are estimates (count / columns rows).
 */
export function buildTimelineMetrics(
  loaded: GridLayoutMetrics,
  buckets: { month: string; count: number }[],
  heights: Pick<ItemHeights, 'monthHeaderHeight' | 'rowHeight'>,
  columns: number
): { metrics: GridLayoutMetrics; windowOffset: number } {
  const first = loaded.months[0];
  const last = loaded.months[loaded.months.length - 1];
  const firstKey = first ? first.key.slice(2) : '';
  const lastKey = last ? last.key.slice(2) : '';
  const estimate = (count: number) =>
    heights.monthHeaderHeight + Math.ceil(count / columns) * heights.rowHeight;

  const months: MonthMarker[] = [];
  let y = 0;
  for (const bucket of buckets) {
    if (!bucket.month || (firstKey && bucket.month <= firstKey)) continue;
    months.push({ itemIndex: -1, offset: y, key: `m-${bucket.month}`, label: monthBucketLabelLocal(bucket.month) });
    y += estimate(bucket.count);
  }
  const windowOffset = y;
  for (const marker of loaded.months) months.push({ ...marker, offset: marker.offset + windowOffset });
  y = windowOffset + loaded.contentHeight;
  for (const bucket of buckets) {
    if (!bucket.month || (lastKey && bucket.month >= lastKey)) continue;
    months.push({ itemIndex: -1, offset: y, key: `m-${bucket.month}`, label: monthBucketLabelLocal(bucket.month) });
    y += estimate(bucket.count);
  }
  return { metrics: { offsets: loaded.offsets, contentHeight: y, months }, windowOffset };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthBucketLabelLocal(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${year}`;
}

export interface RailKnots {
  /** Timeline scroll offsets, ascending. */
  offsets: number[];
  /** Rail progress (0..1) for each offset, ascending. */
  positions: number[];
}

/** Share of the rail given equally to every month, regardless of photo count. */
const RAIL_EQUAL_SHARE = 0.5;

/**
 * Piecewise-linear map between timeline offset and rail progress. Each month
 * gets half its rail space equally and half by content height, so sparse old
 * months stay big enough to hit and busy months don't swallow the rail.
 */
export function buildRailKnots(months: MonthMarker[], scrollable: number): RailKnots {
  const end = Math.max(1, scrollable);
  const offsets: number[] = [];
  for (const marker of months) {
    const clamped = Math.min(Math.max(marker.offset, 0), end);
    if (offsets.length === 0 || clamped > offsets[offsets.length - 1]) offsets.push(clamped);
  }
  if (offsets.length === 0 || offsets[0] > 0) offsets.unshift(0);
  if (offsets[offsets.length - 1] < end) offsets.push(end);
  const segments = offsets.length - 1;
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    const w = (1 - RAIL_EQUAL_SHARE) * ((offsets[i + 1] - offsets[i]) / end) + RAIL_EQUAL_SHARE / segments;
    weights.push(w);
    total += w;
  }
  const positions = [0];
  let acc = 0;
  for (let i = 0; i < segments; i += 1) {
    acc += weights[i];
    positions.push(acc / total);
  }
  return { offsets, positions };
}

/** Interpolates `value` along `from` → `to` knots (both ascending). */
function mapKnots(value: number, from: number[], to: number[]): number {
  'worklet';
  const last = from.length - 1;
  if (value <= from[0]) return to[0];
  if (value >= from[last]) return to[last];
  for (let i = 0; i < last; i += 1) {
    if (value <= from[i + 1]) {
      const span = from[i + 1] - from[i];
      const t = span > 0 ? (value - from[i]) / span : 0;
      return to[i] + t * (to[i + 1] - to[i]);
    }
  }
  return to[last];
}

export function railToOffset(progress: number, knots: RailKnots): number {
  'worklet';
  return mapKnots(progress, knots.positions, knots.offsets);
}

export function offsetToRail(offset: number, knots: RailKnots): number {
  'worklet';
  return mapKnots(offset, knots.offsets, knots.positions);
}
