import { useState } from 'react';
import { Alert } from 'react-native';

import { addAssetsToAlbum, removeAssetsFromAlbum } from '@/data/albums-repository';
import { readLockedConfig } from '@/data/locked-repository';
import { deleteFromVault, exportFromVault, importToVault } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n/hook';
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

/** A toast result: a fixed translation key plus optional variables. */
export interface BulkToast {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/**
 * Every message the bulk actions can produce, as translation-key constants.
 * Fixed messages are plain keys; messages carrying values are builders that
 * fill `{variables}` and resolve the `_one`/`_other` plural variant.
 */
export const BULK_TOAST = {
  SETUP_REQUIRED: 'photos.lockSetupRequired',
  UNLOCKED: (count: number): BulkToast => ({
    key: count === 1 ? 'locked.unlockedCount_one' : 'locked.unlockedCount_other',
    params: { count },
  }),
  MOVED: (count: number): BulkToast => ({
    key: count === 1 ? 'locked.movedCount_one' : 'locked.movedCount_other',
    params: { count },
  }),
  MOVED_WITH_FAILURES: (moved: number, failed: number): BulkToast => ({
    key: 'locked.movedWithFailures',
    params: { moved, failed },
  }),
} as const;

function confirmAlert(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Bulk operations for selection mode, shared by every grid screen.
 * All actions operate on the current selection and clear it on success.
 */
export function useBulkActions({ assets, applyRemovals, lockedContext, albumId }: UseBulkActionsOptions) {
  const { t } = useTranslation();
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

  const toggleLocked = async (): Promise<BulkToast | null> => {
    const selected = selectedAssets();
    if (selected.length === 0) return null;
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
      return BULK_TOAST.UNLOCKED(moved);
    }

    const config = await readLockedConfig();
    if (!config.enabled) {
      finish();
      return { key: BULK_TOAST.SETUP_REQUIRED };
    }

    const count = selected.length;
    const ok = await confirmAlert(
      t(count === 1 ? 'locked.moveConfirmTitle_one' : 'locked.moveConfirmTitle_other', { count }),
      t('locked.moveConfirmBody'),
      t('common.move'),
      t('common.cancel')
    );
    if (!ok) return null;

    setBusy(true);
    try {
      const { imported, failed } = await importToVault(selected);
      applyRemovals(selected.map((a) => a.id));
      finish();
      return failed > 0 ? BULK_TOAST.MOVED_WITH_FAILURES(imported, failed) : BULK_TOAST.MOVED(imported);
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
