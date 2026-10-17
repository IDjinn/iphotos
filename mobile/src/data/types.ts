/** Normalized asset model used across the app. */
export interface PhotoAsset {
  id: string;
  /** Full-resolution URI as reported by the system media store. */
  uri: string;
  filename: string;
  mediaType: 'photo' | 'video' | 'audio' | 'unknown';
  width: number;
  height: number;
  creationTime: number;
  modificationTime: number;
  /** Duration in seconds — videos only. */
  duration?: number;
  /**
   * iPhone Live Photo still (media store `livePhoto` subtype). Still a photo
   * for every filter — the flag only drives the live badge in grids.
   */
  isLive?: boolean;
  /**
   * Cloud Live Photos: authenticated URL of the paired motion clip (the
   * `motion` file variant). Present only when the clip is stored server-side;
   * `sourceHeaders` authorizes the request.
   */
  motionUri?: string;
  /**
   * Present on Locked Folder vault assets: id of the encrypted file set.
   * `uri` points at the decrypted file (grid: photo/poster); videos resolve
   * their playable file lazily through `resolveVaultPlayback(vaultId)`.
   */
  vaultId?: string;
  /**
   * HTTP headers required to fetch `uri` — set on cloud-backed assets whose
   * URI is the authenticated remote file URL instead of a local cache path.
   */
  sourceHeaders?: Record<string, string>;
  /**
   * Lower-quality locally cached variant (cloud thumbnails) the viewer can
   * fall back to when `uri` fails to load, e.g. while offline.
   */
  fallbackUri?: string;
  /**
   * Where the item lives in the unified Photos timeline (Google Photos model):
   * `local` = only on this device (not backed up — shows the "not hosted" badge),
   * `synced` = on the device and in the cloud, `cloud` = in the cloud only
   * (`id` is then the cloud photo id and `uri` an authenticated/cached cloud file).
   * Unset in contexts that don't track sync (albums, locked folder, search…).
   */
  syncState?: 'local' | 'synced' | 'cloud';
}

export interface AlbumRecord {
  id: string;
  title: string;
  createdAt: number;
  coverAssetId?: string;
  itemCount: number;
}

export interface GalleryPage {
  assets: PhotoAsset[];
  endReached: boolean;
  cursor?: string;
}

/** Criteria accepted by the (phase-2 ready) asset repository. */
export interface AssetQuery {
  ids?: string[];
  createdAfter?: number;
  createdBefore?: number;
  /** Oldest-first order (default newest-first) — pairs with `createdAfter` to walk upward. */
  ascending?: boolean;
  mediaTypes?: PhotoAsset['mediaType'][];
  excludeIds?: Set<string>;
  cursor?: string;
  limit?: number;
}
