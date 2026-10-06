import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';
import type { CloudCacheMode } from '@/data/cloud-media-cache';
import type { ThemeMode } from '@/theme/context';

interface SettingsState {
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  /** How cloud gallery media is cached on disk. */
  cloudCacheMode: CloudCacheMode;
  /** Total cache ceiling in MB for `cloudCacheMode: 'limited'`. */
  cloudCacheLimitMb: number;
  setThemeMode: (mode: ThemeMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setCloudCacheMode: (mode: CloudCacheMode) => void;
  setCloudCacheLimitMb: (limitMb: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      hapticsEnabled: true,
      cloudCacheMode: 'default',
      cloudCacheLimitMb: 500,
      setThemeMode: (themeMode) => set({ themeMode }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setCloudCacheMode: (cloudCacheMode) => set({ cloudCacheMode }),
      setCloudCacheLimitMb: (cloudCacheLimitMb) => set({ cloudCacheLimitMb }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
