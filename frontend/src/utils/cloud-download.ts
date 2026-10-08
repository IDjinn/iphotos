import * as MediaLibrary from 'expo-media-library/legacy';

import { downloadFile } from '@/data/cloud-photos-repository';

/** Only the fields the download flow needs — cloud and viewer asset shapes both satisfy it. */
interface DownloadableCloudPhoto {
  id: string;
  fileName: string;
}

/**
 * Downloads the original cloud file and saves it back to the device media
 * library. Returns the outcome message shown to the user — media access can
 * be unavailable (Expo Go), in which case the bytes still land in the app's
 * cache directory.
 */
export async function downloadCloudOriginal(photo: DownloadableCloudPhoto): Promise<string> {
  const file = await downloadFile(photo.id, 'original');
  const { Buffer } = await import('buffer');
  const { writeAsStringAsync, documentDirectory } = await import('expo-file-system/legacy');
  const dotExt = photo.fileName.includes('.') ? photo.fileName.slice(photo.fileName.lastIndexOf('.')) : '.bin';
  const localUri = `${documentDirectory}iphotos-${photo.id}${dotExt}`;
  await writeAsStringAsync(localUri, Buffer.from(file).toString('base64'), { encoding: 'base64' });
  try {
    await MediaLibrary.saveToLibraryAsync(localUri);
    return 'Saved to your library';
  } catch {
    // Expo Go cannot grant media access — the bytes are still in the cache.
    return 'Saved to the app cache directory';
  }
}
