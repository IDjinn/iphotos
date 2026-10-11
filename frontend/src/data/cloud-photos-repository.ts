import { API_URL, ApiError, apiJson, authHeaders, getAccessToken } from '@/data/api-client';

/**
 * Cloud photo repository — docs/plans/09-backend-api.md §4.3.
 * All file endpoints require the Bearer token (URLs are never public).
 */

export type PhotoState = 'PendingUpload' | 'PendingProcessing' | 'Processing' | 'Ready' | 'Failed';
export type VariantKind = 'original' | 'preview' | 'thumbnail' | 'motion';
/** What the backend indexed the asset as — videos get a poster frame as their variants. */
export type CloudMediaType = 'Photo' | 'Video';

export interface CloudVariant {
  kind: 'Original' | 'Preview' | 'Thumbnail' | 'Motion';
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
  mediaType: CloudMediaType;
  sizeBytes: number;
  width?: number;
  height?: number;
  /** Playback length in seconds; videos only. */
  durationSeconds?: number;
  takenAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  /** Catalog title seeded by imports (Google Takeout sidecars). */
  title?: string;
  /** Catalog description/caption seeded by imports (Google Takeout sidecars). */
  description?: string;
  /** iPhone Live Photo: imported with its paired motion file (never a standalone video). */
  isLive: boolean;
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
  /** Live photos in the library — gates the gallery's Live filter chip. */
  livePhotoCount: number;
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

export interface ListPhotosQuery {
  page?: number;
  pageSize?: number;
  /** Restrict the listing to one media kind. */
  mediaType?: CloudMediaType;
  /** Only iPhone Live Photos (`mediaType` stays Photo — live photos are photos). */
  isLive?: boolean;
  /** Sort field — 'takenAt' (default) or 'createdAt'. */
  sortBy?: 'takenAt' | 'createdAt';
  /** Sort direction — 'desc' (default) or 'asc'. */
  order?: 'asc' | 'desc';
  /** ISO 8601 — only photos taken at/after this instant. */
  from?: string;
  /** ISO 8601 — only photos taken at/before this instant. */
  to?: string;
}

export interface PhotoMonthBucket {
  /** "yyyy-MM", or "" for photos without a taken date (they come last in desc order). */
  month: string;
  count: number;
}

/** Timeline month buckets for fast-scroll rails — mirrors the listing order. */
export async function listPhotoMonths(
  query: { mediaType?: CloudMediaType; isLive?: boolean; sortBy?: 'takenAt' | 'createdAt' } = {}
): Promise<PhotoMonthBucket[]> {
  return apiJson<PhotoMonthBucket[]>('/api/photos/months', { params: query });
}

export async function listPhotos(query: ListPhotosQuery | number = 1, pageSize = 50): Promise<PagedResult<CloudPhoto>> {
  const params: Record<string, unknown> =
    typeof query === 'number' ? { page: query, pageSize } : { pageSize: 50, ...query };
  return apiJson<PagedResult<CloudPhoto>>('/api/photos', { params });
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
  /** SHA-256 of the exact bytes being uploaded — enables the direct-to-storage path. */
  contentHash?: string;
  /** Byte size of the file being uploaded — reserved against quota by the ticket. */
  sizeBytes?: number;
  onProgress?: (fraction: number) => void;
}

interface UploadTicketResponse {
  photo: CloudPhoto;
  duplicated: boolean;
  uploadUrl?: string;
  expiresAt?: string;
  /** Present when the backend routed the file to a presigned multipart session (> 5 GB). */
  multipartUploadId?: string;
  partSizeBytes?: number;
}

interface PartUrlResponse {
  url: string;
  partNumber: number;
  expiresAt: string;
}

/** Each part PUT gets its own deadline so a dead connection can't stall the upload. */
const PART_TIMEOUT_MS = 10 * 60_000;
const PART_ATTEMPTS = 2;

/**
 * Uploads a local photo. Preferred path: upload ticket → presigned PUT straight
 * to storage → complete (bytes never cross the backend). Requires the content
 * hash; otherwise — or when the backend cannot presign (501/404) or the direct
 * PUT fails — falls back to the proxied multipart upload.
 */
export async function uploadPhoto(fileUri: string, options: UploadOptions): Promise<UploadOutcome> {
  if (options.contentHash && options.sizeBytes) {
    try {
      return await uploadDirect(fileUri, options);
    } catch (error) {
      // Quota and session failures must abort the backup, not retry via multipart.
      if (error instanceof ApiError && (error.status === 401 || error.status === 413)) throw error;
      console.warn(
        `[upload] direct upload unavailable (${error instanceof Error ? error.message : String(error)}) — falling back to multipart`
      );
    }
  } else {
    console.warn('[upload] direct upload skipped — missing content hash or size');
  }
  return uploadMultipart(fileUri, options);
}

/** Ticket → presigned PUT → complete. Throws ApiError; caller decides on fallback. */
async function uploadDirect(fileUri: string, options: UploadOptions): Promise<UploadOutcome> {
  const ticket = await apiJson<UploadTicketResponse>('/api/photos/upload-ticket', {
    method: 'POST',
    body: {
      fileName: options.fileName,
      contentType: options.mimeType,
      sizeBytes: options.sizeBytes,
      contentHash: options.contentHash,
    },
  });
  if (ticket.duplicated) {
    options.onProgress?.(1);
    return { photo: ticket.photo, duplicated: true };
  }
  if (ticket.multipartUploadId && ticket.partSizeBytes) {
    // The multipart path completes the session itself (parts are confirmed in
    // the same call) and returns the finished photo.
    const photo = await uploadMultipartDirect(fileUri, ticket, options);
    options.onProgress?.(1);
    return { photo, duplicated: false };
  }
  if (!ticket.uploadUrl) {
    throw new ApiError(501, 'Direct upload is not available.');
  }

  await putToPresignedUrl(fileUri, ticket.uploadUrl, options);
  const photo = await completeUpload(ticket.photo.id);
  options.onProgress?.(1);
  return { photo, duplicated: false };
}

/** Presigns and PUTs each part straight to storage, then completes the session.
 * Aborts server-side on failure so uploaded parts don't linger in the bucket.
 * Resolves with the completed photo (the complete call finalizes the upload). */
async function uploadMultipartDirect(
  fileUri: string,
  ticket: UploadTicketResponse,
  options: UploadOptions,
): Promise<CloudPhoto> {
  const { File } = await import('expo-file-system');
  const { fetch } = await import('expo/fetch');
  const uploadId = ticket.multipartUploadId!;
  const partSize = ticket.partSizeBytes!;
  const file = new File(fileUri);
  const total = file.size ?? options.sizeBytes ?? 0;
  if (total <= 0) {
    throw new ApiError(0, 'Upload failed — could not read the file.');
  }

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    let offset = 0;
    let partNumber = 1;
    while (offset < total) {
      const end = Math.min(offset + partSize, total);
      const presigned = await apiJson<PartUrlResponse>(`/api/photos/${ticket.photo.id}/part-url`, {
        method: 'POST',
        body: { partNumber },
      });
      const etag = await putPart(fetch, file.slice(offset, end, options.mimeType), presigned.url);
      parts.push({ partNumber, etag });
      offset = end;
      partNumber += 1;
      options.onProgress?.(offset / total);
    }

    return await apiJson<CloudPhoto>(`/api/photos/${ticket.photo.id}/complete`, {
      method: 'POST',
      body: { multipartUploadId: uploadId, parts },
    });
  } catch (error) {
    // 401/413 are session/quota states the caller handles — don't mask them.
    if (!(error instanceof ApiError && (error.status === 401 || error.status === 413))) {
      await apiJson<void>(`/api/photos/${ticket.photo.id}/abort`, { method: 'POST' }).catch(() => undefined);
    }
    throw error;
  }
}

/** PUTs one part with retries and a per-part deadline; resolves with the stored ETag. */
async function putPart(
  fetchFn: typeof fetch,
  body: Blob,
  url: string,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PART_TIMEOUT_MS);
    try {
      const response = await fetchFn(url, {
        method: 'PUT',
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        const etag = response.headers.get('ETag') ?? response.headers.get('etag');
        if (etag) return etag;
        throw new ApiError(0, 'Upload failed — storage did not confirm the part.');
      }
      lastError = new ApiError(response.status, `Part upload failed (${response.status}).`);
    } catch (error) {
      lastError = error instanceof ApiError ? error : new ApiError(0, 'Part upload failed — check your connection.');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** PUTs the raw file bytes to a presigned storage URL, reporting byte progress. */
async function putToPresignedUrl(fileUri: string, uploadUrl: string, options: UploadOptions): Promise<void> {
  const { createUploadTask, FileSystemUploadType } = await import('expo-file-system/legacy');
  const task = createUploadTask(
    uploadUrl,
    fileUri,
    {
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      httpMethod: 'PUT',
      headers: { 'Content-Type': options.mimeType },
    },
    (progress) => {
      const total = progress.totalBytesExpectedToSend ?? 0;
      if (total > 0) options.onProgress?.(progress.totalBytesSent / total);
    },
  );
  const result = await task.uploadAsync().catch(() => {
    throw new ApiError(0, 'Upload failed — check your connection and try again.');
  });
  if (!result || result.status < 200 || result.status >= 300) {
    throw new ApiError(result?.status ?? 0, `Direct upload failed (${result?.status ?? 'no response'}).`);
  }
}

/** Confirms the bytes landed in storage; the API then enqueues variant processing. */
export async function completeUpload(photoId: string): Promise<CloudPhoto> {
  return apiJson<CloudPhoto>(`/api/photos/${photoId}/complete`, { method: 'POST' });
}

/** Legacy proxied upload (multipart, field `file`) with dedup handled server-side. */
async function uploadMultipart(fileUri: string, options: UploadOptions): Promise<UploadOutcome> {
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
