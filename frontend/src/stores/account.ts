import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kv } from '@/data/db';
import { sqliteStorage } from '@/data/kv-storage';
import type { AuthUser } from '@/data/api-client';
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
  /** True once the persisted refresh token has been validated (or found absent). */
  sessionResolved: boolean;
  setMode: (mode: AppMode) => void;
  /** Activates cloud mode with an authenticated user (tokens handled by api-client). */
  signIn: (user: AuthUser) => void;
  /** Leaves cloud mode; local data (photos, albums, labels) is untouched. */
  signOut: () => void;
  /** Session lost (refresh failed) — called by the api-client. */
  resetSession: () => void;
  /** Validates the persisted refresh token on boot; resolves sessionResolved. */
  resolveSession: () => Promise<void>;
}

const USER_KEY = 'account.user.v1';

function persistUser(user: AccountUser | null): void {
  if (user) kv.set(USER_KEY, JSON.stringify(user));
  else kv.remove(USER_KEY);
}

function readPersistedUser(): AccountUser | null {
  const raw = kv.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AccountUser;
  } catch {
    return null;
  }
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      mode: 'offline',
      user: readPersistedUser(),
      plan: null,
      sessionResolved: false,
      setMode: (mode) => set({ mode }),
      signIn: (authUser) => {
        const user: AccountUser = { email: authUser.email, name: authUser.displayName };
        persistUser(user);
        set({ mode: 'cloud', user });
      },
      signOut: () => {
        persistUser(null);
        set({ mode: 'offline', user: null, plan: null });
        void import('@/data/api-client').then(({ logout }) => logout());
      },
      resetSession: () => {
        persistUser(null);
        set({ mode: 'offline', user: null, plan: null });
      },
      resolveSession: async () => {
        if (get().sessionResolved) return;
        const { restoreSession } = await import('@/data/api-client');
        const ok = await restoreSession();
        if (ok) {
          const user = readPersistedUser();
          if (user) set({ mode: 'cloud', user });
          else await import('@/data/api-client').then(({ clearSession }) => clearSession());
        } else {
          persistUser(null);
          set({ mode: 'offline', user: null });
        }
        set({ sessionResolved: true });
      },
    }),
    {
      name: 'account',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({ mode: state.mode, plan: state.plan }),
    }
  )
);
