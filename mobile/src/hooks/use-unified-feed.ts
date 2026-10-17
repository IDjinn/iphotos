import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toCloudAsset, cloudPhotoTime } from '@/data/cloud-asset';
import { prefetchRecentOriginals, prefetchRecentPreviews } from '@/data/cloud-media-cache';
import { listPhotos, type CloudPhoto } from '@/data/cloud-photos-repository';
import { kv } from '@/data/db';
import {
  getInventoryHashes,
  getUploadedAssetIds,
  getUploadedPhotoIds,
} from '@/data/backup-inventory-repository';
import type { PhotoAsset } from '@/data/types';
import { mergeFeeds } from '@/data/unified-feed';
import { useGalleryFeed } from '@/hooks/use-gallery-feed';
import { isOfflineNow } from '@/hooks/use-net-info';
import { useSettingsStore } from '@/stores/settings';

const CLOUD_PAGE_SIZE = 60;
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
  const device = useGalleryFeed();
  const [cloud, setCloud] = useState<CloudState>({ photos: [], page: 0, done: false, loading: false });
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

  const loadCloudPage = useCallback(async (page: number) => {
    if (cloudBusy.current) return;
    cloudBusy.current = true;
    setCloud((s) => ({ ...s, loading: true }));
    try {
      const result = await listPhotos({ page, pageSize: CLOUD_PAGE_SIZE, order: 'desc' });
      setCloud((s) => {
        const base = page === 1 ? [] : s.photos;
        const seen = new Set(base.map((p) => p.id));
        const photos = [...base, ...result.items.filter((p) => !seen.has(p.id))];
        writeSnapshot(photos.filter((p) => p.state === 'Ready'));
        return { photos, page, done: page >= result.totalPages, loading: false };
      });
    } catch {
      // Offline / server down: fall back to the last known index (page 1) or
      // keep what is already loaded; either way this source is final for now.
      setCloud((s) => ({
        photos: page === 1 ? readSnapshot() : s.photos,
        page,
        done: true,
        loading: false,
      }));
    } finally {
      cloudBusy.current = false;
    }
  }, []);

  // First cloud page on mount.
  useEffect(() => {
    void loadCloudPage(1);
  }, [loadCloudPage]);

  const cloudById = useMemo(() => new Map(cloud.photos.map((p) => [p.id, p])), [cloud.photos]);

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

  const loadDeviceMore = useCallback(async () => {
    if (deviceBusy.current) return;
    deviceBusy.current = true;
    try {
      await device.loadMore();
    } finally {
      deviceBusy.current = false;
    }
  }, [device]);

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
    if (cloud.loading || cloud.done || cloud.page >= MAX_WINDOW_PAGES) return;
    if (cloudOnlyPhotos.length < windowTarget) void loadCloudPage(cloud.page + 1);
  }, [cloud.loading, cloud.done, cloud.page, cloudOnlyPhotos.length, windowTarget, loadCloudPage]);

  useEffect(() => {
    if (cloud.loading || cloudOnlyPhotos.length === 0 || isOfflineNow()) return;
    void prefetchRecentPreviews(cloudOnlyPhotos).catch(() => {});
    void prefetchRecentOriginals(cloudOnlyPhotos).catch(() => {});
  }, [cloud.loading, cloudOnlyPhotos, fullCacheCount]);

  /** Re-fetches every loaded cloud page in place (e.g. after the viewer deleted a cloud photo). */
  const reloadCloud = useCallback(async () => {
    if (cloudBusy.current || cloud.page === 0) return;
    cloudBusy.current = true;
    try {
      const photos: CloudPhoto[] = [];
      let done = false;
      for (let page = 1; page <= cloud.page; page += 1) {
        const result = await listPhotos({ page, pageSize: CLOUD_PAGE_SIZE, order: 'desc' });
        const seen = new Set(photos.map((p) => p.id));
        photos.push(...result.items.filter((p) => !seen.has(p.id)));
        done = page >= result.totalPages;
      }
      writeSnapshot(photos.filter((p) => p.state === 'Ready'));
      setCloud((s) => ({ ...s, photos, done }));
    } catch {
      // Keep the current list — the next refresh retries.
    } finally {
      cloudBusy.current = false;
    }
  }, [cloud.page]);

  const refresh = useCallback(async () => {
    setSyncTick((tick) => tick + 1);
    await Promise.all([device.refresh(), loadCloudPage(1)]);
  }, [device, loadCloudPage]);

  return {
    assets: merged.assets,
    permission: device.permission,
    // Still "loading" while the merge has nothing safe to show but a page is pending.
    loading: device.loading || (merged.assets.length === 0 && merged.blocker !== null),
    refreshing: device.refreshing,
    loadMore,
    refresh,
    reloadCloud,
    askPermission: device.askPermission,
    /** Cloud photo behind a `syncState: 'cloud'` asset — videos play through it. */
    cloudById,
  };
}
