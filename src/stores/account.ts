import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';
import type { AppMode } from '@/data/types';

export interface AccountUser {
  email: string;
  name?: string;
}

export interface AccountPlan {
  id: string;
  label: string;
  renewsAt?: number;
}

interface AccountState {
  /** Active mode — see docs/plans/02-modos-offline-cloud.md. Offline needs no account. */
  mode: AppMode;
  user: AccountUser | null;
  plan: AccountPlan | null;
  setMode: (mode: AppMode) => void;
  /** Leaves cloud mode; local data (photos, albums, labels) is untouched. */
  signOut: () => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      mode: 'offline',
      user: null,
      plan: null,
      setMode: (mode) => set({ mode }),
      signOut: () => set({ mode: 'offline', user: null, plan: null }),
    }),
    {
      name: 'account',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
