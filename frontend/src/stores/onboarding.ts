import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';
import type { AppMode } from '@/data/types';
import { useAccountStore } from './account';

interface OnboardingState {
  completed: boolean;
  mode: AppMode | null;
  complete: (mode: AppMode) => void;
}

/** First-run state — see docs/plans/01-onboarding.md. */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      mode: null,
      complete: (mode) => {
        useAccountStore.getState().setMode(mode);
        set({ completed: true, mode });
      },
    }),
    {
      name: 'onboarding',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
