import { useMemo } from 'react';

import { useSettingsStore } from '@/stores/settings';

import {
  localeTagFor,
  translate,
  translateCount,
  type InterpolationParams,
  type Language,
  type LocaleTag,
  type PluralKey,
  type TranslationKey,
} from './catalog';
import { getSystemLanguage } from './device-locale';

export interface Translation {
  t: (key: TranslationKey, params?: InterpolationParams) => string;
  tCount: (key: PluralKey, count: number, params?: InterpolationParams) => string;
  language: Language;
  localeTag: LocaleTag;
}

/** Reactive translation for React components — re-renders on language change. */
export function useTranslation(): Translation {
  const mode = useSettingsStore((s) => s.language);
  const language = useMemo<Language>(
    () => (mode === 'system' ? getSystemLanguage() : mode),
    [mode]
  );

  return useMemo<Translation>(
    () => ({
      language,
      localeTag: localeTagFor(language),
      t: (key, params) => translate(language, key, params),
      tCount: (key, count, params) => translateCount(language, key, count, params),
    }),
    [language]
  );
}
