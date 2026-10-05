import { API_URL, ApiError, apiJson, apiUpload, authHeaders } from "@/data/api-client";
import type { UploadByteProgress } from "@/data/api-client";

/**
 * Cloud photo repository — docs/plans/09-backend-api.md §3.2.
 * All file endpoints require the Bearer token (URLs are never public).
 */

export type PhotoState = "PendingUpload" | "PendingProcessing" | "Processing" | "Ready" | "Failed";
export type VariantKind = "original" | "preview" | "thumbnail";
/** What the backend indexed the asset as — videos get a poster frame as their variants. */
export type CloudMediaType = "Photo" | "Video";

export interface CloudVariant {
  kind: "Original" | "Preview" | "Thumbnail";
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

export interface ListPhotosQuery {
  page?: number;
  pageSize?: number;
  /** ISO 8601 — only photos taken at/after this instant. */
  from?: string;
  /** ISO 8601 — only photos taken at/before this instant. */
  to?: string;
  /** Case-insensitive substring match on the file name. */
  fileName?: string;
  /** Case-insensitive substring match on make/model. */
  camera?: string;
  /** Restrict the listing to one media kind. */
  mediaType?: CloudMediaType;
}

export interface UploadOutcome {
  photo: CloudPhoto;
  duplicated: boolean;
}

export function fileUrl(photoId: string, kind: VariantKind): string {
  return `${API_URL}/api/photos/${photoId}/files/${kind}`;
}

/** Authenticated headers for raw (non-axios) file requests. */
export function fileHeaders(): Record<string, string> {
  return authHeaders();
}

/** Downloads a file variant into memory (authenticated, with 401 refresh retry). */
export async function downloadFile(photoId: string, kind: VariantKind): Promise<ArrayBuffer> {
  return apiJson<ArrayBuffer>(`/api/photos/${photoId}/files/${kind}`, { responseType: "arraybuffer" });
}

/** Fetches a file variant as a Blob (authenticated, with 401 refresh retry). */
export async function fetchFileBlob(photoId: string, kind: VariantKind): Promise<Blob> {
  return apiJson<Blob>(`/api/photos/${photoId}/files/${kind}`, { responseType: "blob" });
}

export async function listPhotos(query: ListPhotosQuery = {}): Promise<PagedResult<CloudPhoto>> {
  return apiJson<PagedResult<CloudPhoto>>("/api/photos", { params: { ...query } });
}

export async function getPhoto(photoId: string): Promise<CloudPhoto> {
  return apiJson<CloudPhoto>(`/api/photos/${photoId}`);
}

export async function deletePhoto(photoId: string): Promise<void> {
  try {
    await apiJson<void>(`/api/photos/${photoId}`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

export async function getUsage(): Promise<CloudUsage> {
  return apiJson<CloudUsage>("/api/usage");
}

export interface PhotoUploadOptions {
  onProgress?: (progress: UploadByteProgress) => void;
  signal?: AbortSignal;
}

/** Uploads a photo file (multipart, field `file`); dedup is handled server-side. */
export async function uploadPhoto(
  file: File,
  options: PhotoUploadOptions = {},
): Promise<UploadOutcome> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return apiUpload<UploadOutcome>("/api/photos", formData, options);
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
    if (photo.state === "Ready" || photo.state === "Failed") return photo;
    if (Date.now() >= deadline) throw new ApiError(0, "Photo processing timed out — it may finish later.");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
