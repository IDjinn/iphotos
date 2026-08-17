import { create } from 'zustand';

import {
  addToLockedFolder,
  getLockedIdList,
  removeFromLockedFolder,
} from '@/data/locked-repository';
import { addFavorites, listFavoriteIds, removeFavorites } from '@/data/favorites-repository';
import { listAlbums } from '@/data/albums-repository';
import { purgeAssetMetadata } from '@/data/db';
import type { AlbumRecord } from '@/data/types';

/**
 * App-managed library metadata: albums, favorites and locked-folder ids.
 * Kept in memory and refreshed from SQLite after every mutation.
 */
interface LibraryState {
  albums: AlbumRecord[];
  favoriteIds: string[];
  favoriteSet: Set<string>;
  lockedIds: string[];
  lockedSet: Set<string>;
  refresh: () => void;
  addAlbum: (album: AlbumRecord) => void;
  updateAlbum: (album: AlbumRecord) => void;
  removeAlbum: (id: string) => void;
  toggleFavorite: (assetId: string) => void;
  favoriteMany: (assetIds: string[]) => void;
  unfavoriteMany: (assetIds: string[]) => void;
  lockMany: (assetIds: string[]) => void;
  unlockMany: (assetIds: string[]) => void;
  purge: (assetIds: string[]) => void;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  albums: [],
  favoriteIds: [],
  favoriteSet: new Set<string>(),
  lockedIds: [],
  lockedSet: new Set<string>(),

  refresh: () => {
    const favoriteIds = listFavoriteIds();
    const lockedIds = getLockedIdList();
    set({
      albums: listAlbums(),
      favoriteIds,
      favoriteSet: new Set(favoriteIds),
      lockedIds,
      lockedSet: new Set(lockedIds),
    });
  },

  addAlbum: (album) => set((s) => ({ albums: [album, ...s.albums] })),
  updateAlbum: (album) => set((s) => ({ albums: s.albums.map((a) => (a.id === album.id ? album : a)) })),
  removeAlbum: (id) => set((s) => ({ albums: s.albums.filter((a) => a.id !== id) })),

  toggleFavorite: (assetId) => {
    if (get().favoriteSet.has(assetId)) removeFavorites([assetId]);
    else addFavorites([assetId]);
    get().refresh();
  },

  favoriteMany: (assetIds) => {
    addFavorites(assetIds);
    get().refresh();
  },

  unfavoriteMany: (assetIds) => {
    removeFavorites(assetIds);
    get().refresh();
  },

  lockMany: (assetIds) => {
    addToLockedFolder(assetIds);
    get().refresh();
  },

  unlockMany: (assetIds) => {
    removeFromLockedFolder(assetIds);
    get().refresh();
  },

  /** Called after device-level deletion so no metadata points at dead ids. */
  purge: (assetIds) => {
    purgeAssetMetadata(assetIds);
    get().refresh();
  },
}));
