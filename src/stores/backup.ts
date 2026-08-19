import { create } from 'zustand';

import { runBackup, type BackupProgress } from '@/data/backup-engine';

interface BackupState {
  running: boolean;
  progress: BackupProgress | null;
  lastError: string | null;
  lastFinishedAt: number | null;
  start: () => Promise<void>;
}

/** Drives the backup engine from the settings UI — docs/plans/09-backend-api.md task 9.3. */
export const useBackupStore = create<BackupState>()((set) => ({
  running: false,
  progress: null,
  lastError: null,
  lastFinishedAt: null,
  start: async () => {
    if (useBackupStore.getState().running) return;
    set({ running: true, lastError: null, progress: { phase: 'inventory', total: 0, processed: 0, uploaded: 0, skipped: 0, failed: 0 } });
    try {
      const final = await runBackup((progress) => set({ progress }));
      if (final.phase === 'error' && final.error) set({ lastError: final.error });
      else set({ lastFinishedAt: Date.now() });
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : 'Backup failed.' });
    } finally {
      set({ running: false });
    }
  },
}));
