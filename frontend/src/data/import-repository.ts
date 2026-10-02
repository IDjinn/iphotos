import { API_URL, ApiError, apiJson, getAccessToken } from '@/data/api-client';

/**
 * Zip import repository — import photo archives (e.g. Google Takeout zips) into the
 * cloud library. Contract: docs/plans/09-backend-api.md §5 Imports.
 *
 * The upload streams through expo-file-system's native multipart uploader (multi-GB
 * archives never load into memory); status tracking polls the import job until it
 * finishes.
 */

export type ZipImportState = 'Queued' | 'Processing' | 'Done' | 'Failed';

export interface ZipImportJob {
  id: string;
  state: ZipImportState;
  fileName: string;
  sizeBytes: number;
  totalEntries: number;
  processedEntries: number;
  imported: number;
  duplicated: number;
  ignored: number;
  failed: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PickedZip {
  /** Local file/content URI the native uploader streams from. */
  uri: string;
  fileName: string;
  sizeBytes: number | null;
}

export async function pickZipFile(): Promise<PickedZip | null> {
  const { getDocumentAsync } = await import('expo-document-picker');
  const result = await getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.name ?? 'photos.zip',
    sizeBytes: asset.size ?? null,
  };
}

export interface UploadProgress {
  /** 0..1 */
  fraction: number;
  sentBytes: number;
  totalBytes: number;
}

export interface ZipUploadHandle {
  /** Resolves with the import job id once the server accepts the archive. */
  jobIdPromise: Promise<string>;
  /** Aborts the upload; the promise rejects afterwards. */
  cancel: () => Promise<void>;
}

interface UploadTaskLike {
  uploadAsync(): Promise<{ status: number; body: string }>;
  cancelAsync(): Promise<void>;
}

/** Starts a zip import upload; progress and cancellation surface through the handle. */
export function createZipImportUpload(
  zip: PickedZip,
  onUploadProgress?: (progress: UploadProgress) => void,
): ZipUploadHandle {
  let task: UploadTaskLike | null = null;

  const jobIdPromise = (async (): Promise<string> => {
    const { createUploadTask, FileSystemUploadType } = await import('expo-file-system/legacy');
    const { forceRefreshAccessToken } = await import('@/data/api-client');

    const attempt = async (): Promise<string> => {
      const token = getAccessToken();
      if (!token) throw new ApiError(401, 'Not signed in');

      const upload = createUploadTask(
        `${API_URL}/api/imports/zip?fileName=${encodeURIComponent(zip.fileName)}`,
        zip.uri,
        {
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: 'application/zip',
          headers: { Authorization: `Bearer ${token}` },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend ?? zip.sizeBytes ?? 0;
          onUploadProgress?.({
            fraction: total > 0 ? progress.totalBytesSent / total : 0,
            sentBytes: progress.totalBytesSent,
            totalBytes: total,
          });
        },
      );
      task = upload as unknown as UploadTaskLike;

      const result = await upload.uploadAsync().catch(() => {
        throw new ApiError(0, 'Upload failed — check your connection and try again.');
      });
      if (!result) {
        throw new ApiError(0, 'Upload failed — check your connection and try again.');
      }

      if (result.status === 202) {
        const body = JSON.parse(result.body) as { jobId: string };
        return body.jobId;
      }
      if (result.status === 401) throw new ApiError(401, 'Session expired');
      if (result.status === 429) throw new ApiError(429, 'Too many requests — wait a moment and try again.');
      let message = `Import failed (${result.status})`;
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
  })();

  return {
    jobIdPromise,
    cancel: () => task?.cancelAsync() ?? Promise.resolve(),
  };
}

export async function getZipImport(jobId: string): Promise<ZipImportJob> {
  return apiJson<ZipImportJob>(`/api/imports/${jobId}`);
}

export interface PollOptions {
  /** Delay between polls in ms (default 3 s). */
  intervalMs?: number;
  /** Called between polls — return true to stop following (the import continues server-side). */
  shouldStop?: () => boolean;
}

/** Follows an import job until it finishes; resolves with the final status. */
export async function pollZipImport(
  jobId: string,
  onUpdate: (job: ZipImportJob) => void,
  options: PollOptions = {},
): Promise<ZipImportJob> {
  const intervalMs = options.intervalMs ?? 3_000;
  for (;;) {
    const job = await getZipImport(jobId);
    onUpdate(job);
    if (job.state === 'Done' || job.state === 'Failed') return job;
    if (options.shouldStop?.()) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
