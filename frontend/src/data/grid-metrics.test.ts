import { describe, expect, it } from 'vitest';

import {
  computeGridLayout,
  monthAtOffset,
  offsetForPhotoIndex,
  photoAnchorAtOffset,
} from './grid-metrics';
import type { GridItem } from './grouping';
import type { PhotoAsset } from './types';

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

describe('pinch-column anchors', () => {
  const photo = (id: string): PhotoAsset => ({
    id,
    uri: `file://${id}`,
    filename: `${id}.jpg`,
    mediaType: 'photo',
    width: 100,
    height: 100,
    creationTime: 0,
    modificationTime: 0,
  });
  const anchorItems: GridItem[] = [
    { kind: 'month', key: 'm-1', label: 'October 2026' },
    { kind: 'row', key: 'row-0', assets: [photo('a'), photo('b'), photo('c')] },
    { kind: 'row', key: 'row-1', assets: [photo('d'), photo('e'), photo('f')] },
    { kind: 'month', key: 'm-2', label: 'September 2026' },
    { kind: 'row', key: 'row-2', assets: [photo('g'), photo('h')] },
  ];
  // offsets: [0, 40, 170, 300, 340], contentHeight 470.
  const layout = computeGridLayout(anchorItems, HEIGHTS);

  it('anchors to the first photo of the row straddling the viewport top', () => {
    expect(photoAnchorAtOffset(anchorItems, layout, 0)).toBe(0);
    expect(photoAnchorAtOffset(anchorItems, layout, 100)).toBe(0);
    expect(photoAnchorAtOffset(anchorItems, layout, 200)).toBe(3);
    expect(photoAnchorAtOffset(anchorItems, layout, 400)).toBe(6);
    expect(photoAnchorAtOffset(anchorItems, layout, 1000)).toBe(6);
  });

  it('resolves the row offset of the photo a new layout must scroll back to', () => {
    expect(offsetForPhotoIndex(anchorItems, layout, 0)).toBe(40);
    expect(offsetForPhotoIndex(anchorItems, layout, 4)).toBe(170);
    expect(offsetForPhotoIndex(anchorItems, layout, 7)).toBe(340);
  });

  it('clamps out-of-range photo anchors to the content height', () => {
    expect(offsetForPhotoIndex(anchorItems, layout, 99)).toBe(470);
    expect(offsetForPhotoIndex(anchorItems, layout, -1)).toBe(40);
  });
});
