import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { configureLanguage, type LanguageMode } from '@/i18n';
import { sqliteStorage } from '@/data/kv-storage';
import type { CloudCacheMode } from '@/data/cloud-media-cache';
import type { UploadQuality } from '@/data/user-preferences';
import type { ThemeMode } from '@/theme/context';

interface SettingsState {
  themeMode: ThemeMode;
  language: LanguageMode;
  hapticsEnabled: boolean;
  /** How cloud gallery media is cached on disk. */
  cloudCacheMode: CloudCacheMode;
  /** Total cache ceiling in MB for `cloudCacheMode: 'limited'`. */
  cloudCacheLimitMb: number;
  /** Local cache of the account-wide upload quality (synced from the backend). */
  uploadQuality: UploadQuality;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (mode: LanguageMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setCloudCacheMode: (mode: CloudCacheMode) => void;
  setCloudCacheLimitMb: (limitMb: number) => void;
  setUploadQuality: (quality: UploadQuality) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      language: 'system',
      hapticsEnabled: true,
      cloudCacheMode: 'default',
      cloudCacheLimitMb: 500,
      uploadQuality: 'storageSaver',
      setThemeMode: (themeMode) => set({ themeMode }),
      setLanguage: (language) => set({ language }),
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

// Keep the non-react `t()` in sync with the persisted preference.
configureLanguage(useSettingsStore.getState().language);
useSettingsStore.subscribe((state) => configureLanguage(state.language));
