import * as Localization from 'expo-localization';

import type { Language } from './catalog';

/** Resolves the device language to a supported catalog language. */
export function getSystemLanguage(): Language {
  try {
    const locale = Localization.getLocales()[0];
    return locale?.languageCode?.startsWith('pt') ? 'pt' : 'en';
  } catch {
    return 'en';
  }
}
