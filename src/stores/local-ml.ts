import * as LegacyFileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import { indexLocalMlLabels, type MlIndexProgress } from '@/data/ml/indexer';
import { VISION_MODEL_URL, checkModel, deleteModelFile, ensureModelDir } from '@/data/ml/model-files';
import { disposeVisionSession, getVisionSession } from '@/data/ml/vision-session';
import { deleteLabelsBySource } from '@/data/labels-repository';
import { useClassificationStore } from '@/stores/classification';

/**
 * On-device CLIP labeling: model download state plus the incremental labeling
 * run. `modelReady` is the cached verdict of an async file check (the new
 * File API's sync metadata proved unreliable on some devices — see
 * model-files.ts), so the UI never stats the filesystem on the render path.
 */
interface LocalMlState {
  modelReady: boolean;
  downloading: boolean;
  /** 0..1, null when idle or unknown total. */
  downloadProgress: number | null;
  downloadError: string | null;
  running: boolean;
  progress: MlIndexProgress | null;
  lastError: string | null;
  lastRunAt: number | null;
  downloadModel: () => Promise<void>;
  deleteModel: () => Promise<void>;
  runLabeling: (fromScratch?: boolean) => Promise<void>;
}

async function validateDownloadedModel(): Promise<boolean> {
  const check = await checkModel().catch(() => ({ ok: false }));
  return check.ok;
}

export const useLocalMlStore = create<LocalMlState>()((set, get) => ({
  modelReady: false,
  downloading: false,
  downloadProgress: null,
  downloadError: null,
  running: false,
  progress: null,
  lastError: null,
  lastRunAt: null,

  downloadModel: async () => {
    if (get().downloading || get().modelReady) return;
    set({ downloading: true, downloadProgress: 0, downloadError: null });
    const targetUri = await ensureModelDir();
    try {
      const task = LegacyFileSystem.createDownloadResumable(
        VISION_MODEL_URL,
        targetUri,
        {},
        (data) => {
          const total = data.totalBytesExpectedToWrite;
          set({ downloadProgress: total > 0 ? data.totalBytesWritten / total : null });
        }
      );
      const result = await task.downloadAsync();
      if (!result || result.status !== 200) throw new Error(`Download failed (HTTP ${result?.status ?? '??'})`);
      const check = await checkModel();
      console.log(`[ml] vision model downloaded: exists=${check.exists} size=${check.size}`);
      if (!check.ok) {
        await deleteModelFile();
        throw new Error(`Download finished but the file looks wrong (${check.size ?? '?'} bytes)`);
      }
      set({ modelReady: true, downloading: false, downloadProgress: 1 });
    } catch (err) {
      await deleteModelFile();
      set({
        downloading: false,
        downloadProgress: null,
        downloadError: err instanceof Error ? err.message : 'Download failed',
      });
    }
  },

  deleteModel: async () => {
    disposeVisionSession();
    await deleteModelFile();
    set({ modelReady: false, downloadProgress: null, downloadError: null });
  },

  runLabeling: async (fromScratch = false) => {
    if (get().running) return;
    if (!useClassificationStore.getState().localEnabled) return;
    if (!get().modelReady) {
      set({ lastError: 'The on-device model is not downloaded yet.' });
      return;
    }
    set({ running: true, progress: null });
    if (fromScratch) deleteLabelsBySource('ml');
    try {
      // Fail fast with a readable error (e.g. native runtime missing) before
      // any photo is decoded.
      await getVisionSession();
      const result = await indexLocalMlLabels((progress) => set({ progress }));
      set({ lastRunAt: Date.now(), lastError: result.error });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'On-device indexing failed' });
    } finally {
      set({ running: false, progress: null });
    }
  },
}));

// Re-validate the model file once per process, off the render path.
void validateDownloadedModel().then((ok) => useLocalMlStore.setState({ modelReady: ok }));
