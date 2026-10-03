import { create } from 'zustand';

import { runBackup, type BackupProgress } from '@/data/backup-engine';
import { hashPendingItems, runInventoryScan } from '@/data/backup-inventory';
import { getInventoryStats, type InventoryStats } from '@/data/backup-inventory-repository';

export interface ScanActivity {
  phase: 'scanning' | 'hashing';
  processed: number;
  total: number;
}

interface BackupState {
  running: boolean;
  progress: BackupProgress | null;
  lastError: string | null;
  lastFinishedAt: number | null;
  /** Offline-capable inventory job (scan + hashing, no upload). */
  scanning: boolean;
  scanProgress: ScanActivity | null;
  scanError: string | null;
  stats: InventoryStats | null;
  refreshStats: () => void;
  start: () => Promise<void>;
  scan: () => Promise<void>;
}

/** Drives the backup engine and the inventory scan from the UI — docs/plans/03-backup-e2e.md §3. */
export const useBackupStore = create<BackupState>()((set) => ({
  running: false,
  progress: null,
  lastError: null,
  lastFinishedAt: null,
  scanning: false,
  scanProgress: null,
  scanError: null,
  stats: null,
  refreshStats: () => set({ stats: getInventoryStats() }),
  start: async () => {
    if (useBackupStore.getState().running) return;
    set({
      running: true,
      lastError: null,
      progress: { phase: 'inventory', total: 0, processed: 0, uploaded: 0, skipped: 0, failed: 0 },
    });
    try {
      let lastStatsAt = 0;
      const final = await runBackup((progress) => {
        set({ progress });
        // Keep the statistics card live during long uploads without hammering SQLite.
        const now = Date.now();
        if (now - lastStatsAt > 1500) {
          lastStatsAt = now;
          set({ stats: getInventoryStats() });
        }
      });
      if (final.phase === 'error' && final.error) set({ lastError: final.error });
      else set({ lastFinishedAt: Date.now() });
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : 'Backup failed.' });
    } finally {
      set({ running: false, stats: getInventoryStats() });
    }
  },
  scan: async () => {
    const state = useBackupStore.getState();
    if (state.scanning || state.running) return;
    set({ scanning: true, scanError: null, scanProgress: { phase: 'scanning', processed: 0, total: 0 } });
    try {
      let lastStatsAt = 0;
      const bumpStats = () => {
        const now = Date.now();
        if (now - lastStatsAt > 1500) {
          lastStatsAt = now;
          set({ stats: getInventoryStats() });
        }
      };
      await runInventoryScan((p) => {
        set({ scanProgress: { phase: 'scanning', processed: p.scanned, total: p.total } });
        bumpStats();
      });
      await hashPendingItems((p) => {
        set({ scanProgress: { phase: 'hashing', processed: p.hashed, total: p.total } });
        bumpStats();
      });
    } catch (error) {
      set({ scanError: error instanceof Error ? error.message : 'Inventory scan failed.' });
    } finally {
      set({ scanning: false, scanProgress: null, stats: getInventoryStats() });
    }
  },
}));
