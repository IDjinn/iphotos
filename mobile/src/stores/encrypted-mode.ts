import { create } from 'zustand';

import {
  decryptAllBack,
  encryptLibrary,
  type MigrationProgress,
} from '@/data/encrypted-mode-repository';
import {
  destroyKeyConfig,
  isEncryptedModeConfigured,
  isSessionUnlocked,
  lockSession,
  setupPassword,
  unlockWithPassword,
} from '@/data/encrypted-crypto';

/**
 * Encrypted offline mode state machine:
 * disabled → enabling (migration) → locked ⇄ unlocked → disabling.
 * Nothing is persisted here; the SecureStore key config is the source of
 * truth for "enabled", and the in-memory key for "unlocked".
 */
interface EncryptedModeState {
  enabled: boolean;
  unlocked: boolean;
  migrating: boolean;
  progress: MigrationProgress | null;
  lastError: string | null;
  refresh: () => Promise<void>;
  enable: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  disable: (password: string) => Promise<boolean>;
}

export const useEncryptedModeStore = create<EncryptedModeState>()((set, get) => ({
  enabled: false,
  unlocked: false,
  migrating: false,
  progress: null,
  lastError: null,

  refresh: async () => {
    const enabled = await isEncryptedModeConfigured();
    set({ enabled, unlocked: enabled && isSessionUnlocked() });
  },

  enable: async (password) => {
    if (get().migrating) return false;
    set({ migrating: true, progress: null, lastError: null });
    try {
      await setupPassword(password);
      const result = await encryptLibrary(
        (progress) => set({ progress }),
        () => false
      );
      set({
        enabled: true,
        unlocked: true,
        progress: result,
        lastError: result.failed > 0 ? `${result.failed} photos could not be encrypted` : null,
      });
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Encryption failed' });
      return false;
    } finally {
      set({ migrating: false });
    }
  },

  unlock: async (password) => {
    const ok = await unlockWithPassword(password);
    set({ unlocked: ok, lastError: ok ? null : 'Wrong password' });
    return ok;
  },

  lock: () => {
    lockSession();
    set({ unlocked: false });
  },

  disable: async (password) => {
    if (get().migrating) return false;
    if (!(await unlockWithPassword(password))) {
      set({ lastError: 'Wrong password' });
      return false;
    }
    set({ migrating: true, progress: null, lastError: null });
    try {
      const result = await decryptAllBack((progress) => set({ progress }));
      if (result.failed === 0) {
        await destroyKeyConfig();
        set({ enabled: false, unlocked: false, progress: result });
        return true;
      }
      set({
        lastError: `${result.failed} photos could not be restored — they stay encrypted`,
        progress: result,
      });
      return false;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Decryption failed' });
      return false;
    } finally {
      set({ migrating: false });
    }
  },
}));
