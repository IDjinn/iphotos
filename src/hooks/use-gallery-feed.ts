import { useCallback, useEffect, useRef, useState } from 'react';

import { getPermissionStatus, onLibraryChange, queryAssets, requestPermission } from '@/data/media-repository';
import type { PhotoAsset } from '@/data/types';
import { useLibraryStore } from '@/stores/library';

type PermissionState = 'unknown' | 'granted' | 'limited' | 'denied';

/**
 * Paginated newest-first gallery feed for the Photos tab.
 * Excludes Locked Folder items and reacts to library changes.
 */
export function useGalleryFeed() {
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const lockedSet = useLibraryStore((s) => s.lockedSet);

  const checkPermission = useCallback(async () => {
    const response = await getPermissionStatus();
    const privileges = response.accessPrivileges ?? (response.granted ? 'all' : 'none');
    const next: PermissionState = response.granted
      ? privileges === 'limited'
        ? 'limited'
        : 'granted'
      : 'denied';
    setPermission(next);
    return next;
  }, []);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    const page = await queryAssets({ excludeIds: useLibraryStore.getState().lockedSet });
    cursorRef.current = page.cursor;
    setEndReached(page.endReached);
    setAssets(page.assets);
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (endReached || cursorRef.current === undefined) return;
    const page = await queryAssets({
      cursor: cursorRef.current,
      excludeIds: useLibraryStore.getState().lockedSet,
    });
    cursorRef.current = page.cursor;
    if (page.endReached) setEndReached(true);
    if (page.assets.length > 0) {
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
      });
    }
  }, [endReached]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }, [loadFirstPage]);

  // Initial permission check + first page.
  useEffect(() => {
    void (async () => {
      const status = await checkPermission();
      if (status === 'granted' || status === 'limited') await loadFirstPage();
      else setLoading(false);
    })();
  }, [checkPermission, loadFirstPage]);

  // Re-filter when the locked set changes (items moved in/out).
  useEffect(() => {
    if (permission !== 'granted' && permission !== 'limited') return;
    setAssets((prev) => prev.filter((a) => !lockedSet.has(a.id)));
  }, [lockedSet, permission]);

  // React to system library changes (camera, downloads, other apps).
  useEffect(() => {
    if (permission !== 'granted' && permission !== 'limited') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onLibraryChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadFirstPage(), 900);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [permission, loadFirstPage]);

  const askPermission = useCallback(async () => {
    const response = await requestPermission();
    const privileges = response.accessPrivileges ?? (response.granted ? 'all' : 'none');
    const next: PermissionState = response.granted
      ? privileges === 'limited'
        ? 'limited'
        : 'granted'
      : 'denied';
    setPermission(next);
    if (next === 'granted' || next === 'limited') await loadFirstPage();
  }, [loadFirstPage]);

  return { assets, permission, loading, refreshing, endReached, loadMore, refresh, askPermission };
}
