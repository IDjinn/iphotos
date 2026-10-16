import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kv } from '@/data/db';
import { sqliteStorage } from '@/data/kv-storage';
import type { AuthUser } from '@/data/api-client';

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
  user: AccountUser | null;
  plan: AccountPlan | null;
  /** True once the persisted refresh token has been validated (or found absent). */
  sessionResolved: boolean;
  /** Activates the session for an authenticated user (tokens handled by api-client). */
  signIn: (user: AuthUser) => void;
  /** Clears the session and account-scoped caches; user data (vault, encrypted
   * mode, local library) is untouched. */
  signOut: () => void;
  /** Session lost (refresh rejected) — called by the api-client. */
  resetSession: () => void;
  /** Validates the persisted refresh token on boot; resolves sessionResolved. */
  resolveSession: () => Promise<void>;
  /** Syncs the persisted plan with the billing contract. */
  refreshPlan: () => Promise<void>;
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

/** Fires the local sign-out cleanup (caches + account metadata); never blocks. */
function purgeLocalAccountData(): void {
  void import('@/data/logout-cleanup').then(({ purgeAccountData }) => purgeAccountData());
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      user: readPersistedUser(),
      plan: null,
      sessionResolved: false,
      signIn: (authUser) => {
        const user: AccountUser = { email: authUser.email, name: authUser.displayName };
        persistUser(user);
        set({ user });
      },
      signOut: () => {
        persistUser(null);
        set({ user: null, plan: null });
        purgeLocalAccountData();
        void import('@/data/api-client').then(({ logout }) => logout());
      },
      resetSession: () => {
        persistUser(null);
        set({ user: null, plan: null });
        purgeLocalAccountData();
      },
      resolveSession: async () => {
        if (get().sessionResolved) return;
        try {
          const { restoreSession } = await import('@/data/api-client');
          const ok = await restoreSession();
          if (ok) {
            const user = readPersistedUser();
            if (user) set({ user });
            else await import('@/data/api-client').then(({ clearSession }) => clearSession());
          } else {
            persistUser(null);
            set({ user: null });
          }
        } catch {
          // Unexpected storage failure — fall through to the login gate
          // instead of holding the splash screen forever.
          persistUser(null);
          set({ user: null });
        } finally {
          set({ sessionResolved: true });
        }
      },
      refreshPlan: async () => {
        try {
          const billing = await import('@/data/billing');
          const [status, catalog] = await Promise.all([
            billing.getBillingStatus(),
            billing.getBillingCatalog(),
          ]);
          if (status.state !== 'Active' && status.state !== 'Grace') {
            set({ plan: null });
            return;
          }
          const product = catalog.products.find((p) => p.productId === status.plan);
          set({
            plan: {
              id: status.plan,
              label: product?.displayName ?? status.plan,
              renewsAt: status.expiresAt ? Date.parse(status.expiresAt) : undefined,
            },
          });
        } catch {
          // Contract unreachable — keep the last known plan; screens show their own errors.
        }
      },
    }),
    {
      name: 'account',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({ plan: state.plan }),
    }
  )
);
