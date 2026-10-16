import { create } from 'zustand';

import {
  createZipImportUpload,
  pollZipImport,
  type PickedZip,
  type ZipImportJob,
} from '@/data/import-repository';

export type ImportZipPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface ImportZipState {
  phase: ImportZipPhase;
  /** 0..1 during upload; null when idle. */
  uploadProgress: number | null;
  fileName: string | null;
  /** Size of the picked archive (reported by the picker; null when unknown). */
  pickedSizeBytes: number | null;
  /** Latest server status while the import runs. */
  job: ZipImportJob | null;
  error: string | null;
  /** True when the user stopped following an import that still finishes server-side. */
  detached: boolean;
  start: (zip: PickedZip) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

let runToken = 0;
let activeCancel: (() => Promise<void>) | null = null;

/**
 * Drives a zip import from the UI: upload → follow server status → report.
 * Cancelling during upload aborts the transfer; cancelling while the server works
 * only detaches the UI (the import finishes on its own and dedupe keeps re-imports
 * safe) — docs/plans/06-importacao-zip.md (server-side revision).
 */
export const useImportZipStore = create<ImportZipState>()((set, get) => ({
  phase: 'idle',
  uploadProgress: null,
  fileName: null,
  pickedSizeBytes: null,
  job: null,
  error: null,
  detached: false,

  start: async (zip) => {
    const { phase } = get();
    if (phase === 'uploading' || phase === 'processing') return;

    const token = ++runToken;
    set({
      phase: 'uploading',
      uploadProgress: 0,
      fileName: zip.fileName,
      pickedSizeBytes: zip.sizeBytes,
      job: null,
      error: null,
      detached: false,
    });

    try {
      const handle = createZipImportUpload(zip, (progress) => {
        if (token === runToken) set({ uploadProgress: progress.fraction });
      });
      activeCancel = handle.cancel;

      const jobId = await handle.jobIdPromise;
      if (token !== runToken) return;

      set({ phase: 'processing', uploadProgress: null });
      const finalJob = await pollZipImport(
        jobId,
        (job) => {
          if (token === runToken) set({ job });
        },
        { shouldStop: () => token !== runToken },
      );
      if (token !== runToken) return;
      set({ phase: 'done', job: finalJob });
    } catch (error) {
      if (token !== runToken) return;
      const message = error instanceof Error ? error.message : 'Import failed — try again.';
      set({ phase: 'error', error: message });
    } finally {
      if (token === runToken) activeCancel = null;
    }
  },

  cancel: async () => {
    const { phase } = get();
    if (phase !== 'uploading' && phase !== 'processing') return;

    const currentJob = get().job;
    const token = ++runToken;
    const cancelUpload = activeCancel;
    activeCancel = null;

    if (phase === 'uploading') {
      // Nothing is staged yet — aborting loses nothing.
      await cancelUpload?.().catch(() => undefined);
      set({ phase: 'idle', uploadProgress: null });
      return;
    }

    // The archive is already with the server; stop following it instead of
    // pretending it stopped.
    set({ phase: 'idle', uploadProgress: null, detached: true, job: currentJob });
  },

  reset: () => {
    ++runToken;
    activeCancel = null;
    set({
      phase: 'idle',
      uploadProgress: null,
      fileName: null,
      pickedSizeBytes: null,
      job: null,
      error: null,
      detached: false,
    });
  },
}));
