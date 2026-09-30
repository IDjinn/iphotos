/**
 * expo-media-library/legacy is used instead of the SDK 57 class-based API
 * because the new `ExpoMediaLibraryNext` native module requires a dev build
 * and is not available in Expo Go. Everything is behind this repository, so
 * migrating later is a one-file change.
 */
import * as MediaLibrary from 'expo-media-library/legacy';

import type { AssetQuery, GalleryPage, PhotoAsset } from './types';

const DEFAULT_PAGE_SIZE = 120;
/** Upper bound of internal fetches per call while filtering exclusions. */
const MAX_INTERNAL_FETCHES = 6;

export function mapAsset(a: MediaLibrary.Asset): PhotoAsset {
  const type =
    a.mediaType === MediaLibrary.MediaType.photo
      ? 'photo'
      : a.mediaType === MediaLibrary.MediaType.video
        ? 'video'
        : a.mediaType === MediaLibrary.MediaType.audio
          ? 'audio'
          : 'unknown';
  return {
    id: a.id,
    uri: a.uri,
    filename: a.filename ?? '',
    mediaType: type,
    width: a.width ?? 0,
    height: a.height ?? 0,
    creationTime: a.creationTime ?? 0,
    modificationTime: a.modificationTime ?? 0,
    duration: typeof a.duration === 'number' && a.duration > 0 ? a.duration : undefined,
  };
}

export function getPermissionStatus(): Promise<MediaLibrary.PermissionResponse> {
  // Same granular scope as requestPermission(): without it this checks
  // photo+video+audio and rejects in Expo Go (no READ_MEDIA_AUDIO declared).
  return MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
}

export function requestPermission(): Promise<MediaLibrary.PermissionResponse> {
  // Granular photo+video only: requesting 'audio' fails in Expo Go, whose
  // manifest doesn't declare READ_MEDIA_AUDIO.
  return MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
}

/** Subscribes to system media library changes (inserts, deletes, updates). */
export function onLibraryChange(callback: () => void): () => void {
  const sub = MediaLibrary.addListener(() => callback());
  return () => sub.remove();
}

function mediaTypeFilters(types?: PhotoAsset['mediaType'][]): MediaLibrary.MediaTypeValue[] | undefined {
  if (!types || types.length === 0) return undefined;
  const mapped: MediaLibrary.MediaTypeValue[] = [];
  for (const t of types) {
    if (t === 'photo') mapped.push(MediaLibrary.MediaType.photo);
    else if (t === 'video') mapped.push(MediaLibrary.MediaType.video);
    else if (t === 'audio') mapped.push(MediaLibrary.MediaType.audio);
  }
  return mapped.length > 0 ? mapped : undefined;
}

/**
 * Executes one query against the local asset repository.
 * Excluded ids (e.g. Locked Folder items) are filtered client-side,
 * fetching additional pages internally until the limit is satisfied.
 */
export async function queryAssets(query: AssetQuery = {}): Promise<GalleryPage> {
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  const exclude = query.excludeIds && query.excludeIds.size > 0 ? query.excludeIds : undefined;

  if (query.ids) {
    const assets = await fetchAssetsByIds(query.ids);
    const filtered = exclude ? assets.filter((a) => !exclude.has(a.id)) : assets;
    return { assets: filtered, endReached: true };
  }

  const collected: PhotoAsset[] = [];
  let cursor = query.cursor;
  let hasNextPage = true;
  let fetches = 0;

  while (collected.length < limit && hasNextPage && fetches < MAX_INTERNAL_FETCHES) {
    fetches++;
    const page = await MediaLibrary.getAssetsAsync({
      first: limit,
      after: cursor,
      sortBy: [['creationTime', false]],
      mediaType: mediaTypeFilters(query.mediaTypes),
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
    });
    const mapped = page.assets.map(mapAsset);
    const kept = exclude ? mapped.filter((a) => !exclude.has(a.id)) : mapped;
    collected.push(...kept);
    hasNextPage = page.hasNextPage;
    cursor = page.hasNextPage ? page.endCursor : undefined;
    if (page.assets.length === 0) break;
  }

  return { assets: collected.slice(0, limit), endReached: !hasNextPage, cursor };
}

/** Fetches assets by explicit ids, preserving the caller's order. */
export async function fetchAssetsByIds(ids: string[]): Promise<PhotoAsset[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];

  // The legacy API has no bulk `ids` filter, so resolve individually with
  // bounded concurrency. Deleted ids resolve to null and are dropped.
  const results = new Map<string, PhotoAsset | null>();
  const CONCURRENCY = 12;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (id) => {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
          results.set(id, mapAsset(info));
        } catch {
          results.set(id, null);
        }
      })
    );
  }
  return unique.map((id) => results.get(id)).filter((a): a is PhotoAsset => Boolean(a));
}

export async function getAssetById(id: string): Promise<PhotoAsset | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
    return mapAsset(info);
  } catch {
    return null;
  }
}

/** A device folder as exposed by the system media store (Camera, Screenshots…). */
export interface DeviceFolder {
  id: string;
  title: string;
  assetCount: number;
}

/** Lists device folders with at least one asset. */
export async function listDeviceFolders(): Promise<DeviceFolder[]> {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  return albums
    .filter((a) => a.assetCount > 0 && a.title.trim().length > 0)
    .map((a) => ({ id: a.id, title: a.title, assetCount: a.assetCount }));
}

/**
 * Pages through every asset of one device folder, newest first, handing
 * batches to `handle`. Stops early if `handle` returns false.
 */
export async function forEachFolderAsset(
  folderId: string,
  handle: (assets: PhotoAsset[]) => Promise<boolean | void> | boolean | void,
  pageSize = 500
): Promise<void> {
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: pageSize,
      after: cursor,
      album: folderId,
      sortBy: [['creationTime', false]],
    });
    if (page.assets.length > 0) {
      const proceed = await handle(page.assets.map(mapAsset));
      if (proceed === false) return;
    }
    hasNextPage = page.hasNextPage;
    cursor = page.hasNextPage ? page.endCursor : undefined;
  }
}

/**
 * Pages through every photo in the whole library, newest first, handing
 * batches to `handle` along with the media store's total photo count. Stops
 * early if `handle` returns false. Videos are excluded (no frames to send).
 */
export async function forEachLibraryPhoto(
  handle: (assets: PhotoAsset[], totalCount: number) => Promise<boolean | void> | boolean | void,
  pageSize = 100
): Promise<void> {
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: pageSize,
      after: cursor,
      sortBy: [['creationTime', false]],
      mediaType: [MediaLibrary.MediaType.photo],
    });
    if (page.assets.length > 0) {
      const proceed = await handle(page.assets.map(mapAsset), page.totalCount);
      if (proceed === false) return;
    }
    hasNextPage = page.hasNextPage;
    cursor = page.hasNextPage ? page.endCursor : undefined;
  }
}

