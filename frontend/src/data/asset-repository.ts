import { onLibraryChange, queryAssets } from './media-repository';
import type { AssetQuery, GalleryPage } from './types';

/**
 * Abstraction over where assets come from. Phase 1 ships the local
 * implementation backed by `expo-media-library`. Phase 2 adds a remote
 * implementation (self-hosted or cloud backend) without touching the UI:
 * screens only ever talk to this interface.
 */
export interface AssetRepository {
  /** Newest-first paged query with optional filters. */
  query(query?: AssetQuery): Promise<GalleryPage>;
  /** Subscribes to external changes; returns an unsubscribe function. */
  subscribeChanges(callback: () => void): () => void;
}

export const localAssetRepository: AssetRepository = {
  query: (query: AssetQuery = {}) => queryAssets(query),
  subscribeChanges: (callback: () => void) => onLibraryChange(callback),
};
