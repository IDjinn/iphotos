import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';

interface SuggestionDismissalsState {
  /** Server suggestion ids (stable hashes) the user said "Not now" to —
   * dismissed forever, same semantics as the web's localStorage list. */
  dismissed: string[];
  dismiss: (id: string) => void;
}

/** Persisted "Not now" for people suggestions (doc 18 §7.4) — shared by the
 * people hub and the person screen. Accepting a suggestion removes it
 * server-side, so stale ids here are harmless. */
export const useSuggestionDismissalsStore = create<SuggestionDismissalsState>()(
  persist(
    (set) => ({
      dismissed: [],
      dismiss: (id) =>
        set((state) =>
          state.dismissed.includes(id) ? state : { dismissed: [...state.dismissed, id] },
        ),
    }),
    {
      name: 'suggestion-dismissals',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
