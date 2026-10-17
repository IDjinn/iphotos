import { describe, expect, it } from 'vitest';

import { mergeFeeds, type FeedSource } from './unified-feed';
import type { PhotoAsset } from './types';

function asset(id: string, creationTime: number): PhotoAsset {
  return {
    id,
    uri: `file://${id}`,
    filename: `${id}.jpg`,
    mediaType: 'photo',
    width: 1,
    height: 1,
    creationTime,
    modificationTime: creationTime,
  };
}

const source = (times: number[], done: boolean, prefix: string): FeedSource => ({
  items: times.map((t, i) => asset(`${prefix}${i}`, t)),
  done,
});
const ids = (feed: { assets: PhotoAsset[] }) => feed.assets.map((a) => a.id);

describe('mergeFeeds', () => {
  it('interleaves two finished sources newest first', () => {
    const feed = mergeFeeds(source([50, 30, 10], true, 'd'), source([40, 20], true, 'c'));
    expect(ids(feed)).toEqual(['d0', 'c0', 'd1', 'c1', 'd2']);
    expect(feed.blocker).toBeNull();
  });

  it('holds back items older than the oldest loaded item of an unfinished source', () => {
    // Cloud only loaded down to t=40: a cloud item at t=35 might still exist, so
    // device items older than 40 stay hidden until the next cloud page arrives.
    const feed = mergeFeeds(source([50, 45, 30, 10], true, 'd'), source([60, 40], false, 'c'));
    expect(ids(feed)).toEqual(['c0', 'd0', 'd1', 'c1']);
    expect(feed.blocker).toBe('cloud');
  });

  it('asks for the device page when the device source holds the frontier back', () => {
    const feed = mergeFeeds(source([50, 35], false, 'd'), source([60, 40, 30], false, 'c'));
    expect(ids(feed)).toEqual(['c0', 'd0', 'c1', 'd1']);
    expect(feed.blocker).toBe('device');
  });

  it('shows nothing until an unfinished empty source loads its first page', () => {
    const feed = mergeFeeds(source([50, 40], true, 'd'), { items: [], done: false });
    expect(ids(feed)).toEqual([]);
    expect(feed.blocker).toBe('cloud');
  });

  it('treats an unavailable (done, empty) cloud as device-only', () => {
    const feed = mergeFeeds(source([50, 40], false, 'd'), { items: [], done: true });
    expect(ids(feed)).toEqual(['d0', 'd1']);
    expect(feed.blocker).toBe('device');
  });

  it('advances past a source whose loaded items were all filtered out', () => {
    // Cloud page covered down to t=30 but every item was already on the device:
    // the horizon (not the empty item list) bounds the frontier.
    const feed = mergeFeeds(source([50, 40, 35, 20], true, 'd'), { items: [], done: false, horizon: 30 });
    expect(ids(feed)).toEqual(['d0', 'd1', 'd2']);
    expect(feed.blocker).toBe('cloud');
  });

  it('sorts undated items (0) last', () => {
    const feed = mergeFeeds(source([50, 0], true, 'd'), source([40, 0], true, 'c'));
    expect(ids(feed)).toEqual(['d0', 'c0', 'd1', 'c1']);
  });

  it('is empty and done when both sources are empty and finished', () => {
    expect(mergeFeeds({ items: [], done: true }, { items: [], done: true })).toEqual({
      assets: [],
      blocker: null,
    });
  });
});
