import { describe, expect, it } from 'vitest';

import { computeGridLayout, monthAtOffset } from './grid-metrics';
import type { GridItem } from './grouping';

const HEIGHTS = { monthHeaderHeight: 40, dayHeaderHeight: 24, rowHeight: 130 };

const items: GridItem[] = [
  { kind: 'month', key: 'm-1', label: 'October 2026' },
  { kind: 'day', key: 'd-1', label: 'Today' },
  { kind: 'row', key: 'row-0', assets: [] },
  { kind: 'row', key: 'row-1', assets: [] },
  { kind: 'month', key: 'm-2', label: 'September 2026' },
  { kind: 'row', key: 'row-2', assets: [] },
];

describe('computeGridLayout', () => {
  it('builds prefix-sum offsets and content height from item heights', () => {
    const layout = computeGridLayout(items, HEIGHTS);
    expect(layout.offsets).toEqual([0, 40, 64, 194, 324, 364]);
    expect(layout.contentHeight).toBe(494);
  });

  it('collects month markers in scroll order', () => {
    const layout = computeGridLayout(items, HEIGHTS);
    expect(layout.months).toEqual([
      { itemIndex: 0, offset: 0, key: 'm-1', label: 'October 2026' },
      { itemIndex: 4, offset: 324, key: 'm-2', label: 'September 2026' },
    ]);
  });

  it('handles an empty list', () => {
    const layout = computeGridLayout([], HEIGHTS);
    expect(layout.offsets).toEqual([]);
    expect(layout.contentHeight).toBe(0);
    expect(layout.months).toEqual([]);
  });
});

describe('monthAtOffset', () => {
  const layout = computeGridLayout(items, HEIGHTS);

  it('resolves the month governing an offset', () => {
    expect(monthAtOffset(layout, 0)?.key).toBe('m-1');
    expect(monthAtOffset(layout, 63)?.key).toBe('m-1');
    expect(monthAtOffset(layout, 324)?.key).toBe('m-2');
    expect(monthAtOffset(layout, 1000)?.key).toBe('m-2');
  });

  it('falls back to the first month above the content start', () => {
    expect(monthAtOffset(layout, -10)?.key).toBe('m-1');
  });

  it('returns null without months', () => {
    expect(monthAtOffset(computeGridLayout([], HEIGHTS), 0)).toBeNull();
  });
});
