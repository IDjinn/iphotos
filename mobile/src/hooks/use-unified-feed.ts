import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toCloudAsset, cloudPhotoTime } from '@/data/cloud-asset';
import { prefetchRecentOriginals, prefetchRecentPreviews } from '@/data/cloud-media-cache';
import { listPhotoMonths, listPhotos, type CloudPhoto, type PhotoMonthBucket } from '@/data/cloud-photos-repository';
import { kv } from '@/data/db';
import {
  getInventoryHashes,
  getUploadedAssetIds,
  getUploadedPhotoIds,
} from '@/data/backup-inventory-repository';
import type { PhotoAsset } from '@/data/types';
import { mergeFeeds, mergeNewer } from '@/data/unified-feed';
import { queryAssets } from '@/data/media-repository';
import { useGalleryFeed } from '@/hooks/use-gallery-feed';
import { isOfflineNow } from '@/hooks/use-net-info';
import { useLibraryStore } from '@/stores/library';
import { useSettingsStore } from '@/stores/settings';
import { monthEndIso } from '@/utils/dates';

const CLOUD_PAGE_SIZE = 100;
/** Keep pulling pages until this many items are shown, so a short first page never looks empty. */
const MIN_SHOWN = 150;
/** Cloud-only photos kept warm in the cache window (previews: 100, originals: the Settings count). */
const MIN_CACHE_WINDOW = 100;
const MAX_WINDOW_PAGES = 5;
/** Offline index: the newest cloud photos survive restarts so the grid still lists them without a network. */
const SNAPSHOT_KEY = 'photos.cloudIndex.v1';
const SNAPSHOT_LIMIT = 300;

interface CloudState {
  photos: CloudPhoto[];
  page: number;
  done: boolean;
  loading: boolean;
  /** `before` bound these pages were loaded with (undefined = newest window). */
  anchor?: number;
}

function readSnapshot(): CloudPhoto[] {
  try {
    const raw = kv.get(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as CloudPhoto[]) : [];
  } catch {
    return [];
  }
}

function writeSnapshot(photos: CloudPhoto[]): void {
  try {
    kv.set(SNAPSHOT_KEY, JSON.stringify(photos.slice(0, SNAPSHOT_LIMIT)));
  } catch {
    // Best-effort — the snapshot only matters for offline starts.
  }
}

/**
 * Unified Photos timeline (Google Photos model): the device library plus the
 * photos that exist only in the cloud, newest first. Device items carry a
 * `syncState` (`local` = not backed up → "not hosted" badge, `synced` = both);
 * cloud-only items are `cloud`. A cloud photo that the device already holds
 * (same hash / uploaded from here) is shown once, from the local file.
 */
export function useUnifiedFeed() {
  // Window anchor: the feed shows photos taken before this instant (a rail
  // jump rebases it onto a month instead of paging all the way down).
  const [anchor, setAnchor] = useState<number | undefined>(undefined);
  const device = useGalleryFeed(anchor);
  const [cloud, setCloud] = useState<CloudState>({ photos: [], page: 0, done: false, loading: false });
  const cloudEpoch = useRef(0);
  const [syncTick, setSyncTick] = useState(0);
  const cloudBusy = useRef(false);
  const deviceBusy = useRef(false);
  const fullCacheCount = useSettingsStore((s) => s.cloudFullCacheCount);

  // Backup progress changes the inventory without touching this screen's state:
  // re-read it whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      setSyncTick((tick) => tick + 1);
    }, [])
  );

  const sync = useMemo(
    () => ({
      assetIds: getUploadedAssetIds(),
      photoIds: getUploadedPhotoIds(),
      hashes: getInventoryHashes(),
    }),
    // `device.assets` also re-reads it: freshly scanned/hashed rows change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncTick, device.assets.length]
  );

  const loadCloudPage = useCallback(
    async (page: number) => {
      // Page 1 (re)starts the window and supersedes anything in flight.
      if (page === 1) cloudEpoch.current += 1;
      else if (cloudBusy.current) return;
      const epoch = cloudEpoch.current;
      cloudBusy.current = true;
      setCloud((s) => ({ ...s, loading: true }));
      try {
        const result = await listPhotos({
          page,
          pageSize: CLOUD_PAGE_SIZE,
          order: 'desc',
          ...(anchor !== undefined ? { to: new Date(anchor).toISOString() } : {}),
        });
        if (epoch !== cloudEpoch.current) return;
        setCloud((s) => {
          const base = page === 1 ? [] : s.photos;
          const seen = new Set(base.map((p) => p.id));
          const photos = [...base, ...result.items.filter((p) => !seen.has(p.id))];
          if (anchor === undefined) writeSnapshot(photos.filter((p) => p.state === 'Ready'));
          return { photos, page, done: page >= result.totalPages, loading: false, anchor };
        });
      } catch {
        if (epoch !== cloudEpoch.current) return;
        // Offline / server down: fall back to the last known index (page 1) or
        // keep what is already loaded; either way this source is final for now.
        setCloud((s) => ({
          photos: page === 1 ? (anchor === undefined ? readSnapshot() : []) : s.photos,
          page,
          done: true,
          loading: false,
          anchor,
        }));
      } finally {
        if (epoch === cloudEpoch.current) cloudBusy.current = false;
      }
    },
    [anchor]
  );

  // First cloud page on mount.
  useEffect(() => {
    void loadCloudPage(1);
  }, [loadCloudPage]);

  // Newer-than-window side (only for a rebased window): photos after `anchor`,
  // walked oldest-first so scrolling up prepends them in order.
  const [newerCloud, setNewerCloud] = useState<{ photos: CloudPhoto[]; page: number; done: boolean }>({
    photos: [],
    page: 0,
    done: false,
  });
  const [newerDevice, setNewerDevice] = useState<{ assets: PhotoAsset[]; done: boolean }>({
    assets: [],
    done: false,
  });
  const newerCursor = useRef<string | undefined>(undefined);
  const newerBusy = useRef(false);
  const newerEpoch = useRef(0);
  const devicePermitted = device.permission === 'granted' || device.permission === 'limited';

  // A new anchor (or none) starts the newer side over.
  useEffect(() => {
    newerEpoch.current += 1;
    newerBusy.current = false;
    newerCursor.current = undefined;
    setNewerCloud({ photos: [], page: 0, done: false });
    setNewerDevice({ assets: [], done: false });
  }, [anchor]);

  const loadNewer = useCallback(async () => {
    if (anchor === undefined || newerBusy.current) return;
    if (newerCloud.done && (newerDevice.done || !devicePermitted)) return;
    newerBusy.current = true;
    const epoch = newerEpoch.current;
    try {
      const [cloudResult, deviceResult] = await Promise.all([
        newerCloud.done
          ? null
          : listPhotos({
              page: newerCloud.page + 1,
              pageSize: CLOUD_PAGE_SIZE,
              order: 'asc',
              from: new Date(anchor).toISOString(),
            }).catch(() => 'failed' as const),
        newerDevice.done || !devicePermitted
          ? null
          : queryAssets({
              createdAfter: anchor,
              ascending: true,
              cursor: newerCursor.current,
              excludeIds: useLibraryStore.getState().lockedSet,
            }).catch(() => 'failed' as const),
      ]);
      if (epoch !== newerEpoch.current) return;
      if (cloudResult) {
        setNewerCloud((c) =>
          cloudResult === 'failed'
            ? { ...c, done: true }
            : {
                photos: [...c.photos, ...cloudResult.items.filter((p) => !c.photos.some((q) => q.id === p.id))],
                page: c.page + 1,
                done: c.page + 1 >= cloudResult.totalPages,
              }
        );
      }
      if (deviceResult) {
        if (deviceResult !== 'failed') newerCursor.current = deviceResult.cursor;
        setNewerDevice((d) =>
          deviceResult === 'failed'
            ? { ...d, done: true }
            : {
                assets: [...d.assets, ...deviceResult.assets.filter((a) => !d.assets.some((b) => b.id === a.id))],
                done: deviceResult.endReached,
              }
        );
      }
    } finally {
      if (epoch === newerEpoch.current) newerBusy.current = false;
    }
  }, [anchor, newerCloud, newerDevice, devicePermitted]);

  const hasNewer = anchor !== undefined && !(newerCloud.done && (newerDevice.done || !devicePermitted));

  const cloudById = useMemo(
    () => new Map([...newerCloud.photos, ...cloud.photos].map((p) => [p.id, p])),
    [cloud.photos, newerCloud.photos]
  );

  const cloudOnlyPhotos = useMemo(
    () =>
      cloud.photos.filter(
        (p) => p.state === 'Ready' && !sync.photoIds.has(p.id) && !sync.hashes.has(p.contentHash)
      ),
    [cloud.photos, sync]
  );

  const deviceItems = useMemo<PhotoAsset[]>(
    () =>
      device.assets.map((a) => ({ ...a, syncState: sync.assetIds.has(a.id) ? 'synced' : 'local' })),
    [device.assets, sync]
  );
  const cloudItems = useMemo(() => cloudOnlyPhotos.map(toCloudAsset), [cloudOnlyPhotos]);

  const merged = useMemo(() => {
    const last = cloud.photos[cloud.photos.length - 1];
    return mergeFeeds(
      { items: deviceItems, done: device.endReached },
      {
        items: cloudItems,
        done: cloud.done,
        horizon: last ? cloudPhotoTime(last) : undefined,
      }
    );
  }, [deviceItems, device.endReached, cloudItems, cloud.done, cloud.photos]);

  const newerAssets = useMemo<PhotoAsset[]>(() => {
    if (anchor === undefined) return [];
    const cloudOnly = newerCloud.photos
      .filter((p) => p.state === 'Ready' && !sync.photoIds.has(p.id) && !sync.hashes.has(p.contentHash))
      .map(toCloudAsset);
    const last = newerCloud.photos[newerCloud.photos.length - 1];
    const asc = mergeNewer(
      {
        items: newerDevice.assets.map((a) => ({
          ...a,
          syncState: sync.assetIds.has(a.id) ? ('synced' as const) : ('local' as const),
        })),
        done: newerDevice.done || !devicePermitted,
      },
      { items: cloudOnly, done: newerCloud.done, horizon: last ? cloudPhotoTime(last) : undefined }
    );
    return asc.reverse(); // newest first, ready to sit above the window
  }, [anchor, newerCloud, newerDevice, sync, devicePermitted]);

  const assets = useMemo(() => {
    if (newerAssets.length === 0) return merged.assets;
    const seen = new Set(newerAssets.map((a) => a.id));
    return [...newerAssets, ...merged.assets.filter((a) => !seen.has(a.id))];
  }, [newerAssets, merged.assets]);

  const loadDeviceMore = useCallback(async () => {
    if (deviceBusy.current) return;
    deviceBusy.current = true;
    try {
      await device.loadMore();
    } finally {
      deviceBusy.current = false;
    }
  }, [device]);

  // Full-timeline month buckets (newest first) — let the fast-scroll rail
  // cover months that are not loaded yet.
  const [timelineMonths, setTimelineMonths] = useState<PhotoMonthBucket[]>([]);
  const fetchTimelineMonths = useCallback(() => {
    listPhotoMonths({})
      .then((buckets) => setTimelineMonths(buckets.filter((b) => b.month !== '')))
      .catch(() => {});
  }, []);
  useEffect(fetchTimelineMonths, [fetchTimelineMonths]);

  /**
   * Rebases the feed onto a month (rail jump): newest photos taken at/before
   * that month's end. The newest month returns to the live window.
   */
  const jumpToMonth = useCallback(
    (month: string) => {
      const newest = timelineMonths[0]?.month;
      setAnchor(!month || month === newest ? undefined : Date.parse(monthEndIso(month)));
    },
    [timelineMonths]
  );

  /** True while a rebased window is still loading — the grid shows a loader, not stale photos. */
  const jumping = anchor !== device.loadedBefore || anchor !== cloud.anchor;

  const loadMore = useCallback(() => {
    if (merged.blocker === 'cloud') {
      if (!cloud.done) void loadCloudPage(cloud.page + 1);
    } else if (merged.blocker === 'device') {
      void loadDeviceMore();
    }
  }, [merged.blocker, cloud.done, cloud.page, loadCloudPage, loadDeviceMore]);

  // A merged list that is still short (or empty) must not wait for a scroll to
  // ask for more — the blocking source's next page is what reveals the rest.
  useEffect(() => {
    const ready = device.permission === 'granted' || device.permission === 'limited';
    if (!ready || device.loading || cloud.loading || deviceBusy.current) return;
    if (merged.blocker !== null && merged.assets.length < MIN_SHOWN) loadMore();
  }, [merged, device.permission, device.loading, cloud.loading, loadMore]);

  // Cache window: the newest cloud-only photos stay on disk per the Settings
  // count (previews + originals), so they open instantly and offline.
  const windowTarget = Math.max(MIN_CACHE_WINDOW, fullCacheCount);
  useEffect(() => {
    if (anchor !== undefined || cloud.loading || cloud.done || cloud.page >= MAX_WINDOW_PAGES) return;
    if (cloudOnlyPhotos.length < windowTarget) void loadCloudPage(cloud.page + 1);
  }, [anchor, cloud.loading, cloud.done, cloud.page, cloudOnlyPhotos.length, windowTarget, loadCloudPage]);

  useEffect(() => {
    if (anchor !== undefined || cloud.loading || cloudOnlyPhotos.length === 0 || isOfflineNow()) return;
    void prefetchRecentPreviews(cloudOnlyPhotos).catch(() => {});
    void prefetchRecentOriginals(cloudOnlyPhotos).catch(() => {});
  }, [anchor, cloud.loading, cloudOnlyPhotos, fullCacheCount]);

  /** Re-fetches every loaded cloud page in place (e.g. after the viewer deleted a cloud photo). */
  const reloadCloud = useCallback(async () => {
    if (cloudBusy.current || cloud.page === 0) return;
    cloudBusy.current = true;
    try {
      const photos: CloudPhoto[] = [];
      let done = false;
      for (let page = 1; page <= cloud.page; page += 1) {
        const result = await listPhotos({
          page,
          pageSize: CLOUD_PAGE_SIZE,
          order: 'desc',
          ...(anchor !== undefined ? { to: new Date(anchor).toISOString() } : {}),
        });
        const seen = new Set(photos.map((p) => p.id));
        photos.push(...result.items.filter((p) => !seen.has(p.id)));
        done = page >= result.totalPages;
      }
      if (anchor === undefined) writeSnapshot(photos.filter((p) => p.state === 'Ready'));
      setCloud((s) => ({ ...s, photos, done }));
    } catch {
      // Keep the current list — the next refresh retries.
    } finally {
      cloudBusy.current = false;
    }
  }, [cloud.page, anchor]);

  const refresh = useCallback(async () => {
    setSyncTick((tick) => tick + 1);
    fetchTimelineMonths();
    await Promise.all([device.refresh(), loadCloudPage(1)]);
  }, [device, loadCloudPage, fetchTimelineMonths]);

  return {
    assets,
    loadNewer,
    hasNewer,
    permission: device.permission,
    // Still "loading" while the merge has nothing safe to show but a page is pending.
    loading: device.loading || (merged.assets.length === 0 && merged.blocker !== null),
    refreshing: device.refreshing,
    loadMore,
    jumpToMonth,
    jumping,
    timelineMonths,
    refresh,
    reloadCloud,
    askPermission: device.askPermission,
    /** Cloud photo behind a `syncState: 'cloud'` asset — videos play through it. */
    cloudById,
  };
}
