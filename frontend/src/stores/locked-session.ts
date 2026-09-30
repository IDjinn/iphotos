import { create } from 'zustand';

import { purgeVaultSessionCache } from '@/data/vault-crypto';

/**
 * In-memory unlock state for the Locked Folder. Unlocked while the app
 * stays in the foreground; the root layout locks it on background.
 * (The PIN hash itself lives in expo-secure-store.)
 */
interface LockedSessionState {
  unlocked: boolean;
  unlock: () => void;
  lock: () => void;
}

export const useLockedSessionStore = create<LockedSessionState>()((set) => ({
  unlocked: false,
  unlock: () => set({ unlocked: true }),
  lock: () => {
    set({ unlocked: false });
    // Drop every decrypted vault file — plaintext must not outlive the session.
    purgeVaultSessionCache();
  },
}));
