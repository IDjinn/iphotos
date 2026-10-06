import type { PhotoAsset } from './types';

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const CONVERTIBLE_EXTENSIONS = new Set(['heic', 'heif']);
/** Video formats the backend ingests; files pass through untouched. */
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'avi', '3gp', '3gpp']);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function mimeFor(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
};

export interface PreparedUpload {
  uri: string;
  fileName: string;
  mimeType: string;
}

/**
 * Normalizes an asset into uploadable bytes. HEIC/HEIF images are transcoded
 * client-side (the backend accepts jpeg|png|webp); videos pass through
 * untouched. Null means the format can never be uploaded.
 */
export async function prepareForUpload(asset: PhotoAsset): Promise<PreparedUpload | null> {
  const extension = extensionOf(asset.filename);
  if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    return { uri: asset.uri, fileName: asset.filename, mimeType: mimeFor(extension) };
  }
  if (SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
    return {
      uri: asset.uri,
      fileName: asset.filename,
      mimeType: VIDEO_MIME_BY_EXTENSION[extension],
    };
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
