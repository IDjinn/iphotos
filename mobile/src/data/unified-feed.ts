import type { PhotoAsset } from './types';

/**
 * Photos-timeline merge (Google Photos model): one newest-first list built from
 * two independently paged sources — the device library and the cloud-only
 * photos. Each source is sorted newest-first, so an item is only safe to show
 * once no unloaded page of either source could still hold something newer.
 */

export interface FeedSource {
  /** Loaded items, newest first by `creationTime` (0 = undated, sorted last). */
  items: PhotoAsset[];
  /** True when every page has been loaded (or the source is unavailable). */
  done: boolean;
  /**
   * Oldest time covered by the loaded pages, measured before any filtering.
   * Lets a source whose loaded items were all filtered out (e.g. cloud photos
   * already on the device) still advance the frontier instead of blocking it.
   */
  horizon?: number;
}

export interface MergedFeed {
  assets: PhotoAsset[];
  /** Source whose next page unlocks more items; null when everything is shown. */
  blocker: 'device' | 'cloud' | null;
}

/** Oldest loaded time of an unfinished source; +Infinity while nothing is loaded yet. */
function lowOf(source: FeedSource): number {
  if (source.horizon !== undefined) return source.horizon;
  if (source.items.length === 0) return Number.POSITIVE_INFINITY;
  return source.items[source.items.length - 1].creationTime;
}

export function mergeFeeds(device: FeedSource, cloud: FeedSource): MergedFeed {
  // Unseen items of an unfinished source are all older than its last loaded
  // item, so only items at/after the newest of those "lows" are final.
  const deviceLow = device.done ? Number.NEGATIVE_INFINITY : lowOf(device);
  const cloudLow = cloud.done ? Number.NEGATIVE_INFINITY : lowOf(cloud);
  const frontier = Math.max(deviceLow, cloudLow);

  const merged: PhotoAsset[] = [];
  let d = 0;
  let c = 0;
  while (d < device.items.length || c < cloud.items.length) {
    const takeDevice =
      c >= cloud.items.length ||
      (d < device.items.length && device.items[d].creationTime >= cloud.items[c].creationTime);
    const next = takeDevice ? device.items[d] : cloud.items[c];
    if (next.creationTime < frontier) break;
    merged.push(next);
    if (takeDevice) d += 1;
    else c += 1;
  }

  if (frontier === Number.NEGATIVE_INFINITY) return { assets: merged, blocker: null };
  // The source with the newest low is the one holding the frontier back.
  return { assets: merged, blocker: cloudLow >= deviceLow ? 'cloud' : 'device' };
}
