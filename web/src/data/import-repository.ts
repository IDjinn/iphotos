import { ApiError, apiJson, apiUpload } from "@/data/api-client";

/**
 * Zip import repository — import photo archives (e.g. Google Takeout zips) into
 * the cloud library. Contract: docs/plans/09-backend-api.md §3.4.
 *
 * The caller collects the archive File through any input path (file picker,
 * drag-and-drop, clipboard paste); this module streams it as multipart to the
 * backend and tracks the import job until it finishes.
 */

export type ZipImportState = "Queued" | "Processing" | "Done" | "Failed";

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
  /** Video entries skipped by the import (video hosting is not supported yet). */
  videosIgnored: number;
  failed: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
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
  cancel: () => void;
}

/** Minutes the server gets to confirm the upload after the last byte leaves the
 * client (it still has to stage the archive locally) before the transfer is
 * abandoned with a clear error instead of spinning forever. */
const STAGING_TIMEOUT_MS = 15 * 60_000;

/** Starts a zip import upload; progress and cancellation surface through the handle. */
export function createZipImportUpload(
  file: File,
  onUploadProgress?: (progress: UploadProgress) => void,
): ZipUploadHandle {
  const controller = new AbortController();
  let stagingTimedOut = false;

  const jobIdPromise = (async (): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    let stagingWatchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const body = await apiUpload<{ jobId: string }>("/api/imports/zip", formData, {
        params: { fileName: file.name },
        onProgress: (progress) => {
          if (
            progress.totalBytes > 0
            && progress.sentBytes >= progress.totalBytes
            && stagingWatchdog === undefined
          ) {
            // All bytes have left the client; the server still stages the archive
            // before replying. Bound that window so a stalled backend surfaces
            // as an error instead of an eternal spinner.
            stagingWatchdog = setTimeout(() => {
              stagingTimedOut = true;
              controller.abort();
            }, STAGING_TIMEOUT_MS);
          }
          onUploadProgress?.({
            fraction: progress.totalBytes > 0 ? progress.sentBytes / progress.totalBytes : 0,
            sentBytes: progress.sentBytes,
            totalBytes: progress.totalBytes,
          });
        },
        signal: controller.signal,
      });
      return body.jobId;
    } catch (error: unknown) {
      if (stagingTimedOut) {
        throw new ApiError(
          0,
          "Upload timed out — the server didn't confirm the transfer. Check the backend logs or try again.",
        );
      }
      if (error instanceof ApiError && error.status === 429) {
        throw new ApiError(429, "Too many requests — wait a moment and try again.");
      }
      throw error;
    } finally {
      if (stagingWatchdog !== undefined) clearTimeout(stagingWatchdog);
    }
  })();

  return {
    jobIdPromise,
    cancel: () => controller.abort(),
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
    if (job.state === "Done" || job.state === "Failed") return job;
    if (options.shouldStop?.()) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
