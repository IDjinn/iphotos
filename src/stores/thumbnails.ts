import { create } from 'zustand';

import { generateMissingThumbnails, type ThumbnailBatchProgress } from '@/data/thumbnails';

/**
 * Background thumbnail generation state, surfaced in Settings so the user can
 * kick off / watch the library-wide preview pass.
 */
interface ThumbnailsState {
  running: boolean;
  progress: ThumbnailBatchProgress | null;
  lastError: string | null;
  startBatch: () => Promise<void>;
}

export const useThumbnailsStore = create<ThumbnailsState>()((set, get) => ({
  running: false,
  progress: null,
  lastError: null,
  startBatch: async () => {
    if (get().running) return;
    set({ running: true, progress: null, lastError: null });
    try {
      const result = await generateMissingThumbnails(
        (progress) => set({ progress }),
        () => false
      );
      set({ progress: result });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Thumbnail generation failed' });
    } finally {
      set({ running: false });
    }
  },
}));
