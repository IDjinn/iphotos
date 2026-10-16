import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';

interface OnboardingState {
  completed: boolean;
  complete: () => void;
}

/** First-run state — see docs/plans/01-onboarding.md. */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      complete: () => set({ completed: true }),
    }),
    {
      name: 'onboarding',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
