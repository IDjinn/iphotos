import { API_URL, ApiError, apiJson, authHeaders, getAccessToken } from '@/data/api-client';

/**
 * Cloud photo repository — docs/plans/09-backend-api.md §4.3.
 * All file endpoints require the Bearer token (URLs are never public).
 */

export type PhotoState = 'PendingProcessing' | 'Processing' | 'Ready' | 'Failed';
export type VariantKind = 'original' | 'preview' | 'thumbnail';

export interface CloudVariant {
  kind: 'Original' | 'Preview' | 'Thumbnail';
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
}

export interface CloudPhoto {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  takenAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  state: PhotoState;
  lastError?: string;
  contentHash: string;
  createdAt: string;
  variants: CloudVariant[];
}

export interface CloudUsage {
  usedBytes: number;
  quotaBytes: number;
  photoCount: number;
  variantCount: number;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface UploadOutcome {
  photo: CloudPhoto;
  duplicated: boolean;
}

export function fileUrl(photoId: string, kind: VariantKind): string {
  return `${API_URL}/api/photos/${photoId}/files/${kind}`;
}

/** Authenticated headers for expo-image sources and raw downloads. */
export function fileHeaders(): Record<string, string> {
  return authHeaders();
}

/** Downloads a file variant into memory (authenticated, with 401 refresh retry). */
export async function downloadFile(photoId: string, kind: VariantKind): Promise<ArrayBuffer> {
  return apiJson<ArrayBuffer>(`/api/photos/${photoId}/files/${kind}`, { responseType: 'arraybuffer' });
}

export async function listPhotos(page = 1, pageSize = 50): Promise<PagedResult<CloudPhoto>> {
  return apiJson<PagedResult<CloudPhoto>>('/api/photos', { params: { page, pageSize } });
}

/** Hashes of every photo already stored server-side — the dedup set for backups. */
export async function listAllContentHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  let page = 1;
  for (;;) {
    const result = await listPhotos(page, 100);
    for (const item of result.items) hashes.add(item.contentHash);
    if (page >= result.totalPages) break;
    page += 1;
  }
  return hashes;
}

export async function getPhoto(photoId: string): Promise<CloudPhoto> {
  return apiJson<CloudPhoto>(`/api/photos/${photoId}`);
}

export async function deletePhoto(photoId: string): Promise<void> {
  try {
    await apiJson<void>(`/api/photos/${photoId}`, { method: 'DELETE' });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

export async function getUsage(): Promise<CloudUsage> {
  return apiJson<CloudUsage>('/api/usage');
}

export interface UploadOptions {
  fileName: string;
  mimeType: string;
  onProgress?: (fraction: number) => void;
}

/** Uploads a local file (multipart, field `file`) with dedup handled server-side. */
export async function uploadPhoto(fileUri: string, options: UploadOptions): Promise<UploadOutcome> {
  const { uploadAsync, FileSystemUploadType } = await import('expo-file-system/legacy');
  const { forceRefreshAccessToken } = await import('@/data/api-client');

  const attempt = async (): Promise<UploadOutcome> => {
    const token = getAccessToken();
    if (!token) throw new ApiError(401, 'Not signed in');

    const result = await uploadAsync(`${API_URL}/api/photos`, fileUri, {
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: options.mimeType,
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      throw new ApiError(0, 'Upload failed — check your connection and try again.');
    });

    if (result.status === 200 || result.status === 201) {
      const body = JSON.parse(result.body) as UploadOutcome;
      options.onProgress?.(1);
      return body;
    }
    if (result.status === 401) throw new ApiError(401, 'Session expired');
    if (result.status === 413) throw new ApiError(413, 'Storage quota exceeded — free up space in your account.');
    if (result.status === 429) throw new ApiError(429, 'Too many uploads — wait a moment and try again.');
    let message = `Upload failed (${result.status})`;
    try {
      message = (JSON.parse(result.body) as { error?: string }).error ?? message;
    } catch {
      // Non-JSON error body — keep the default message.
    }
    throw new ApiError(result.status, message);
  };

  try {
    return await attempt();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await forceRefreshAccessToken();
      return attempt();
    }
    throw error;
  }
}

export interface PollOptions {
  /** Overall deadline in ms (default 2 min). */
  timeoutMs?: number;
  /** Delay between polls (default 3 s; the worker polls jobs every ~2 s). */
  intervalMs?: number;
}

/** Polls a photo until the worker finishes it (`Ready` or `Failed`). */
export async function pollUntilDone(photoId: string, options: PollOptions = {}): Promise<CloudPhoto> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const photo = await getPhoto(photoId);
    if (photo.state === 'Ready' || photo.state === 'Failed') return photo;
    if (Date.now() >= deadline) throw new ApiError(0, 'Photo processing timed out — it may finish later.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
