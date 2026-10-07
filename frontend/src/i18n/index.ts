/**
 * i18n entry point for non-React code (stores, repositories, utils).
 * React components should use `useTranslation()` from `./hook` instead so they
 * re-render when the user changes the language.
 */
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

export type { InterpolationParams, Language, LocaleTag, PluralKey, TranslationKey };
export { localeTagFor };

/** User-facing preference, mirroring `ThemeMode`. */
export type LanguageMode = 'system' | Language;

let preference: LanguageMode = 'system';

/** Called by the settings store on init and on every change. */
export function configureLanguage(mode: LanguageMode): void {
  preference = mode;
}

export function resolveLanguage(mode?: LanguageMode): Language {
  const effective = mode ?? preference;
  return effective === 'system' ? getSystemLanguage() : effective;
}

export function getLanguage(): Language {
  return resolveLanguage();
}

export function t(key: TranslationKey, params?: InterpolationParams): string {
  return translate(getLanguage(), key, params);
}

export function tCount(key: PluralKey, count: number, params?: InterpolationParams): string {
  return translateCount(getLanguage(), key, count, params);
}

export function currentLocaleTag(): LocaleTag {
  return localeTagFor(getLanguage());
}
