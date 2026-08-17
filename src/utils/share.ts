import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { resolveVaultPlayback } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';

/**
 * Shares one or more assets via the system share sheet.
 * On iOS, `ph://` asset URIs must be copied to a local file first.
 * Vault assets resolve their decrypted file from the session cache
 * (videos decrypt on demand — their grid URI is just the poster).
 */
export async function shareAssets(assets: PhotoAsset[]): Promise<void> {
  const uris: string[] = [];

  for (const asset of assets) {
    if (asset.vaultId) {
      if (asset.mediaType === 'video') {
        const uri = await resolveVaultPlayback(asset.vaultId).catch(() => null);
        if (uri) uris.push(uri);
      } else if (asset.uri) {
        uris.push(asset.uri);
      }
      continue;
    }

    if (Platform.OS === 'ios') {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id).catch(() => null);
      const uri = info?.localUri ?? info?.uri ?? asset.uri;
      if (!uri) continue;
      if (uri.startsWith('file://')) {
        uris.push(uri);
        continue;
      }
      // ph:// or remote — copy into cache and share the file.
      const ext = asset.mediaType === 'video' ? 'mov' : 'jpg';
      const target = `${FileSystem.cacheDirectory}${asset.id}.${ext}`;
      try {
        const downloaded = await FileSystem.downloadAsync(uri, target);
        uris.push(downloaded.uri);
      } catch {
        // Skip assets that cannot be copied.
      }
    } else {
      if (asset.uri) uris.push(asset.uri);
    }
  }

  if (uris.length === 0) return;
  await Sharing.shareAsync(uris[0], uris.length > 1 ? { dialogTitle: `Share ${uris.length} items` } : undefined).catch(
    () => undefined
  );
}

/**
 * Deletes assets from the device library (system confirmation applies)
 * and cleans up app metadata referencing them.
 */
export async function deleteAssetsFromDevice(ids: string[]): Promise<boolean> {
  try {
    await MediaLibrary.deleteAssetsAsync(ids);
    return true;
  } catch {
    return false;
  }
}
