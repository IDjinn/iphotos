import { describe, expect, it } from 'vitest';

import { oneMonthAgoStart } from '@/utils/dates';

import { buildGridData } from './grouping';
import type { PhotoAsset } from './types';

const NOW = new Date(2026, 9, 9, 12, 0, 0).getTime(); // Oct 9 2026, noon

function asset(id: string, creationTime: number): PhotoAsset {
  return {
    id,
    uri: `file://${id}`,
    filename: `${id}.jpg`,
    mediaType: 'photo',
    width: 100,
    height: 100,
    creationTime,
    modificationTime: creationTime,
  };
}

const daysAgo = (n: number) => NOW - n * 86_400_000;
const kinds = (items: ReturnType<typeof buildGridData>['items']) => items.map((i) => i.kind);
const dayLabels = (items: ReturnType<typeof buildGridData>['items']) =>
  items.filter((i) => i.kind === 'day').map((i) => (i.kind === 'day' ? i.label : ''));

describe('buildGridData month-only cutoff', () => {
  it('keeps day headers for photos within the last month', () => {
    const data = buildGridData(
      [asset('a', daysAgo(0)), asset('b', daysAgo(1)), asset('c', daysAgo(10))],
      3,
      { now: NOW }
    );
    expect(dayLabels(data.items)).toEqual(['Today', 'Yesterday', 'September 29, 2026']);
  });

  it('groups photos older than one month by month only', () => {
    const data = buildGridData(
      [
        asset('a', daysAgo(5)),
        asset('b', daysAgo(40)),
        asset('c', daysAgo(40)),
        asset('d', daysAgo(41)),
      ],
      3,
      { now: NOW }
    );
    const kindsList = kinds(data.items);
    // One month header per month; the older month carries rows without a day header.
    expect(kindsList.filter((k) => k === 'month').length).toBe(2);
    expect(dayLabels(data.items)).toHaveLength(1);
    const olderMonthIndex = data.items.findIndex((i) => i.kind === 'month' && i.key === 'm-2026-08');
    expect(data.items.slice(olderMonthIndex + 1).every((i) => i.kind !== 'day')).toBe(true);
  });

  it('keeps the cutoff day itself on day headers and drops the day before', () => {
    const cutoff = oneMonthAgoStart(NOW);
    const withCutoffDay = buildGridData([asset('a', cutoff)], 3, { now: NOW });
    expect(kinds(withCutoffDay.items)).toContain('day');

    const before = buildGridData([asset('a', cutoff - 1)], 3, { now: NOW });
    expect(kinds(before.items)).toEqual(['month', 'row']);
  });

  it('points stickyIndices at the month headers', () => {
    const data = buildGridData([asset('a', daysAgo(0)), asset('b', daysAgo(40))], 3, { now: NOW });
    const monthIndices = data.items
      .map((item, index) => (item.kind === 'month' ? index : -1))
      .filter((i) => i >= 0);
    expect(data.stickyIndices).toEqual(monthIndices);
  });

  it('handles an empty asset list', () => {
    expect(buildGridData([], 3, { now: NOW })).toEqual({ items: [], stickyIndices: [], total: 0 });
  });
});
