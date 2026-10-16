/**
 * Pure translation core — no React, no native modules.
 * en.json is the source of truth for keys; pt.json must carry the same set
 * (enforced by locales.test.ts). Placeholders use `{varName}`.
 */
import en from './locales/en.json';
import pt from './locales/pt.json';

export type Language = 'en' | 'pt';

const catalogs: Record<Language, Record<string, string>> = { en, pt };

export type TranslationKey = keyof typeof en;

/** Base names of keys that exist as `key_one`/`key_other` pairs. */
export type PluralKey = {
  [K in keyof typeof en]: K extends `${infer B}_one` ? B : never;
}[keyof typeof en];

export type InterpolationParams = Record<string, string | number>;

export type LocaleTag = 'en-US' | 'pt-BR';

export function localeTagFor(language: Language): LocaleTag {
  return language === 'pt' ? 'pt-BR' : 'en-US';
}

function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  language: Language,
  key: TranslationKey,
  params?: InterpolationParams
): string {
  const template = catalogs[language][key] ?? catalogs.en[key];
  if (template === undefined) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[i18n] Missing translation key: ${String(key)}`);
    }
    return key;
  }
  return interpolate(template, params);
}

/** Resolves `key_one`/`key_other` by count (en/pt share the simple 1-vs-rest rule). */
export function translateCount(
  language: Language,
  key: PluralKey,
  count: number,
  params?: InterpolationParams
): string {
  const suffix = count === 1 ? '_one' : '_other';
  return translate(language, `${key}${suffix}` as TranslationKey, { ...params, count });
}
