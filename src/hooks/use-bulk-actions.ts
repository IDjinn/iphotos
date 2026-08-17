import { useState } from 'react';
import { Alert } from 'react-native';

import { addAssetsToAlbum, removeAssetsFromAlbum } from '@/data/albums-repository';
import { readLockedConfig } from '@/data/locked-repository';
import { deleteFromVault, exportFromVault, importToVault } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';
import { useLibraryStore } from '@/stores/library';
import { useSelectionStore } from '@/stores/selection';
import { deleteAssetsFromDevice, shareAssets } from '@/utils/share';

interface UseBulkActionsOptions {
  /** Current list rendered by the screen. */
  assets: PhotoAsset[];
  /** Removes assets from the screen's list after an action. */
  applyRemovals: (removedIds: string[]) => void;
  /** Whether the acting screen is the Locked Folder. */
  lockedContext?: boolean;
  /** Present when acting inside an album — enables "remove from album". */
  albumId?: string;
}

function confirmAlert(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Bulk operations for selection mode, shared by every grid screen.
 * All actions operate on the current selection and clear it on success.
 */
export function useBulkActions({ assets, applyRemovals, lockedContext, albumId }: UseBulkActionsOptions) {
  const [busy, setBusy] = useState(false);

  const selectedAssets = (): PhotoAsset[] => {
    const { idSet } = useSelectionStore.getState();
    return assets.filter((a) => idSet.has(a.id));
  };

  const finish = () => useSelectionStore.getState().end();

  const share = async () => {
    const selected = selectedAssets();
    finish();
    await shareAssets(selected);
  };

  const favorite = () => {
    const selected = selectedAssets();
    const library = useLibraryStore.getState();
    const allFavorited = selected.length > 0 && selected.every((a) => library.favoriteSet.has(a.id));
    if (allFavorited) library.unfavoriteMany(selected.map((a) => a.id));
    else library.favoriteMany(selected.map((a) => a.id));
    finish();
  };

  const addToAlbum = (targetAlbumId: string) => {
    const selected = selectedAssets();
    const added = addAssetsToAlbum(targetAlbumId, selected.map((a) => a.id));
    useLibraryStore.getState().refresh();
    finish();
    return added;
  };

  const toggleLocked = async (): Promise<string> => {
    const selected = selectedAssets();
    if (selected.length === 0) return '';
    const library = useLibraryStore.getState();

    if (lockedContext) {
      const vaultIds = selected.filter((a) => a.vaultId).map((a) => a.vaultId!);
      const legacyIds = selected.filter((a) => !a.vaultId).map((a) => a.id);
      finish();
      if (legacyIds.length > 0) library.unlockMany(legacyIds);
      let exported = 0;
      if (vaultIds.length > 0) {
        setBusy(true);
        try {
          const result = await exportFromVault(vaultIds);
          exported = result.exported;
        } finally {
          setBusy(false);
        }
      }
      const moved = legacyIds.length + exported;
      applyRemovals(selected.map((a) => a.id));
      return `Unlocked ${moved} — back in your gallery`;
    }

    const config = await readLockedConfig();
    if (!config.enabled) {
      finish();
      return 'SETUP_REQUIRED';
    }

    const count = selected.length;
    const ok = await confirmAlert(
      `Move ${count} item${count === 1 ? '' : 's'} to Locked Folder?`,
      'They will be removed from your device gallery and stored encrypted inside iPhotos. If you uninstall iPhotos, locked items are deleted permanently.',
      'Move'
    );
    if (!ok) return '';

    setBusy(true);
    try {
      const { imported, failed } = await importToVault(selected);
      applyRemovals(selected.map((a) => a.id));
      finish();
      return failed > 0
        ? `Moved ${imported} to Locked Folder — ${failed} failed`
        : `Moved ${imported} to Locked Folder`;
    } finally {
      setBusy(false);
    }
  };

  const removeFromAlbum = () => {
    if (!albumId) return;
    const selected = selectedAssets();
    const ids = selected.map((a) => a.id);
    removeAssetsFromAlbum(albumId, ids);
    useLibraryStore.getState().refresh();
    applyRemovals(ids);
    finish();
  };

  const remove = async (): Promise<boolean> => {
    const selected = selectedAssets();
    if (selected.length === 0) return false;
    setBusy(true);
    try {
      let allOk = true;
      if (lockedContext) {
        // Vault items are our encrypted files; legacy items live in the
        // system media store and need the device-level delete flow.
        const vaultIds = selected.filter((a) => a.vaultId).map((a) => a.vaultId!);
        const legacyIds = selected.filter((a) => !a.vaultId).map((a) => a.id);
        if (vaultIds.length > 0) {
          deleteFromVault(vaultIds);
          applyRemovals(vaultIds);
        }
        if (legacyIds.length > 0) {
          const ok = await deleteAssetsFromDevice(legacyIds);
          if (ok) {
            useLibraryStore.getState().purge(legacyIds);
            applyRemovals(legacyIds);
          } else {
            allOk = false;
          }
        }
      } else {
        const ids = selected.map((a) => a.id);
        const ok = await deleteAssetsFromDevice(ids);
        if (ok) {
          useLibraryStore.getState().purge(ids);
          applyRemovals(ids);
        } else {
          allOk = false;
        }
      }
      finish();
      return allOk;
    } finally {
      setBusy(false);
    }
  };

  return { busy, share, favorite, addToAlbum, toggleLocked, removeFromAlbum, remove };
}
