import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';
import type { ThemeMode } from '@/theme/context';

interface SettingsState {
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      hapticsEnabled: true,
      setThemeMode: (themeMode) => set({ themeMode }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
