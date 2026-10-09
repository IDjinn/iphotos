import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';

import { resetInventory } from '@/data/backup-inventory-repository';
import { clearPurchaseToken } from '@/data/billing';
import { purgeCloudMediaCache } from '@/data/cloud-media-cache';
import { clearRecentSearches } from '@/data/search-repository';
import { resetSyncRules } from '@/data/sync-rules-repository';
import { purgeAllThumbnails } from '@/data/thumbnails';

/**
 * Sign-out cleanup — drops everything the account put on this device:
 * media caches (cloud cache, local thumbnails, downloaded videos/originals,
 * expo-image disk cache) and account-scoped metadata (backup inventory,
 * folder rules, recent searches, purchase token), so a different account
 * starts from a clean slate.
 *
 * User data is deliberately never touched: the vault and encrypted-mode
 * directories (plus their SecureStore keys) and the local library metadata
 * (albums, favorites, labels, locked assets) survive sign-out.
 */
export async function purgeAccountData(): Promise<void> {
  // Media caches.
  purgeCloudMediaCache();
  purgeAllThumbnails();
  purgeCacheChildren();
  purgeDownloadedOriginals();
  await Image.clearDiskCache().catch(() => undefined);
  // Account-scoped metadata.
  resetInventory();
  resetSyncRules();
  clearRecentSearches();
  clearPurchaseToken();
}

/** Empties the OS cache directory (cloud videos, share copies, zip staging,
 * decrypted session plaintext) without removing the directory itself. */
function purgeCacheChildren(): void {
  purgeChildren(new Directory(Paths.cache));
}

/** Removes downloaded originals saved back to Documents (`iphotos-*`). */
function purgeDownloadedOriginals(): void {
  const documents = new Directory(Paths.document);
  if (!documents.exists) return;
  for (const child of documents.list()) {
    if (child instanceof File && child.name.startsWith('iphotos-')) {
      try {
        child.delete();
      } catch {
        // Best-effort removal.
      }
    }
  }
}

function purgeChildren(dir: Directory): void {
  if (!dir.exists) return;
  for (const child of dir.list()) {
    try {
      child.delete();
    } catch {
      // Best-effort removal.
    }
  }
}
