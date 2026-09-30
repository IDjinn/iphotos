import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { indexAiLabels, type AiIndexProgress } from '@/data/ai-indexer';
import { deleteLabelsBySource } from '@/data/labels-repository';
import { indexDeviceLabels, type IndexProgress } from '@/data/label-indexer';
import { sqliteStorage } from '@/data/kv-storage';
import { aiLabelingConfigured, getAiApiKey, useAiLabelingStore } from '@/stores/ai-labeling';

interface ClassificationState {
  /**
   * Master switch for every AI feature (on-device CLIP, cloud labeling, model
   * screens, label browsing). Turning it off stops all indexing and hides the
   * AI surfaces; nothing is deleted, so it can be re-enabled at any time.
   */
  aiEnabled: boolean;
  /**
   * On-device labels & search. Optional: turning it off stops indexing and
   * removes labels from search (existing rows are kept for when it returns).
   */
  localEnabled: boolean;
  running: boolean;
  /** Scan progress while a run is in flight; null when idle. */
  progress: IndexProgress | null;
  /** Outcome of the last folder run: folder read failures or a fatal error, if any. */
  lastError: string | null;
  lastRunAt: number | null;
  /** AI run (user-configured vision endpoint) — same progress/error contract. */
  aiRunning: boolean;
  aiProgress: AiIndexProgress | null;
  aiLastError: string | null;
  aiLastRunAt: number | null;
  setLocalEnabled: (enabled: boolean) => void;
  setAiEnabled: (enabled: boolean) => void;
  runIndexation: () => Promise<void>;
  runAiIndexation: (fromScratch?: boolean) => Promise<void>;
}

function summarizeFolderErrors(folders: string[]): string | null {
  if (folders.length === 0) return null;
  const shown = folders.slice(0, 3).join(', ');
  const suffix = folders.length > 3 ? ` +${folders.length - 3}` : '';
  return `Couldn't read ${folders.length} folder${folders.length === 1 ? '' : 's'}: ${shown}${suffix}`;
}

export const useClassificationStore = create<ClassificationState>()(
  persist(
    (set, get) => ({
      aiEnabled: true,
      localEnabled: true,
      running: false,
      progress: null,
      lastError: null,
      lastRunAt: null,
      aiRunning: false,
      aiProgress: null,
      aiLastError: null,
      aiLastRunAt: null,
      setLocalEnabled: (localEnabled) => {
        set({ localEnabled });
        if (localEnabled && get().aiEnabled) void get().runIndexation();
      },
      setAiEnabled: (aiEnabled) => set({ aiEnabled }),
      runIndexation: async () => {
        if (get().running || !get().localEnabled || !get().aiEnabled) return;
        set({ running: true, progress: null });
        try {
          const result = await indexDeviceLabels((progress) => set({ progress }));
          set({ lastRunAt: Date.now(), lastError: summarizeFolderErrors(result.errors) });
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : 'Indexing failed' });
        } finally {
          set({ running: false, progress: null });
        }
      },
      runAiIndexation: async (fromScratch = false) => {
        if (get().aiRunning || !get().localEnabled || !get().aiEnabled) return;
        if (!aiLabelingConfigured()) {
          set({ aiLastError: 'AI labeling is not set up — add an endpoint in Settings → AI labeling.' });
          return;
        }
        const { endpoint, model } = useAiLabelingStore.getState();
        const apiKey = await getAiApiKey();
        set({ aiRunning: true, aiProgress: null });
        if (fromScratch) deleteLabelsBySource('ai');
        try {
          const result = await indexAiLabels({ endpoint, model, apiKey }, (aiProgress) => set({ aiProgress }));
          set({ aiLastRunAt: Date.now(), aiLastError: result.error });
        } catch (err) {
          set({ aiLastError: err instanceof Error ? err.message : 'AI indexing failed' });
        } finally {
          set({ aiRunning: false, aiProgress: null });
        }
      },
    }),
    {
      name: 'classification',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        aiEnabled: state.aiEnabled,
        localEnabled: state.localEnabled,
        lastRunAt: state.lastRunAt,
        lastError: state.lastError,
        aiLastRunAt: state.aiLastRunAt,
        aiLastError: state.aiLastError,
      }),
    }
  )
);
