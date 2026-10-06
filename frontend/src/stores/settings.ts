import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';
import type { CloudCacheMode } from '@/data/cloud-media-cache';
import type { UploadQuality } from '@/data/user-preferences';
import type { ThemeMode } from '@/theme/context';

interface SettingsState {
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  /** How cloud gallery media is cached on disk. */
  cloudCacheMode: CloudCacheMode;
  /** Total cache ceiling in MB for `cloudCacheMode: 'limited'`. */
  cloudCacheLimitMb: number;
  /** Local cache of the account-wide upload quality (synced from the backend). */
  uploadQuality: UploadQuality;
  setThemeMode: (mode: ThemeMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setCloudCacheMode: (mode: CloudCacheMode) => void;
  setCloudCacheLimitMb: (limitMb: number) => void;
  setUploadQuality: (quality: UploadQuality) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      hapticsEnabled: true,
      cloudCacheMode: 'default',
      cloudCacheLimitMb: 500,
      uploadQuality: 'storageSaver',
      setThemeMode: (themeMode) => set({ themeMode }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setCloudCacheMode: (cloudCacheMode) => set({ cloudCacheMode }),
      setCloudCacheLimitMb: (cloudCacheLimitMb) => set({ cloudCacheLimitMb }),
      setUploadQuality: (uploadQuality) => set({ uploadQuality }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
