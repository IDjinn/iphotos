import type { PhotoAsset } from './types';

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const CONVERTIBLE_EXTENSIONS = new Set(['heic', 'heif']);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function mimeFor(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export interface PreparedUpload {
  uri: string;
  fileName: string;
  mimeType: string;
}

/**
 * Normalizes an asset into uploadable bytes — the backend only accepts
 * jpeg|png|webp (docs/plans/09-backend-api.md §3.2), so HEIC/HEIF is
 * transcoded client-side. Null means the format can never be uploaded.
 */
export async function prepareForUpload(asset: PhotoAsset): Promise<PreparedUpload | null> {
  const extension = extensionOf(asset.filename);
  if (SUPPORTED_EXTENSIONS.has(extension)) {
    return { uri: asset.uri, fileName: asset.filename, mimeType: mimeFor(extension) };
  }
  if (CONVERTIBLE_EXTENSIONS.has(extension)) {
    try {
      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const result = await manipulateAsync(asset.uri, [], { format: SaveFormat.JPEG, compress: 0.92 });
      const fileName = `${asset.filename.replace(/\.[^.]+$/, '')}.jpg`;
      return { uri: result.uri, fileName, mimeType: 'image/jpeg' };
    } catch {
      return null;
    }
  }
  return null;
}
