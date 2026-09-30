/** How the app operates: offline (no account) or with the cloud service. */
export type AppMode = 'offline' | 'cloud';

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
   * Present on Locked Folder vault assets: id of the encrypted file set.
   * `uri` points at the decrypted file (grid: photo/poster); videos resolve
   * their playable file lazily through `resolveVaultPlayback(vaultId)`.
   */
  vaultId?: string;
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
  mediaTypes?: PhotoAsset['mediaType'][];
  excludeIds?: Set<string>;
  cursor?: string;
  limit?: number;
}
