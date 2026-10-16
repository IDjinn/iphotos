import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import pt from './locales/pt.json';

const enEntries = Object.entries(en as Record<string, string>);
const ptCatalog = pt as Record<string, string>;

function placeholders(value: string): string[] {
  return (value.match(/\{(\w+)\}/g) ?? []).sort();
}

describe('i18n catalogs', () => {
  it('pt carries exactly the same keys as en (source of truth)', () => {
    expect(Object.keys(ptCatalog).sort()).toEqual(
      enEntries.map(([key]) => key).sort()
    );
  });

  it('has a non-empty string for every key', () => {
    for (const [key, value] of [...enEntries, ...Object.entries(ptCatalog)]) {
      expect(typeof value, key).toBe('string');
      expect(value.length, key).toBeGreaterThan(0);
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    for (const [key, value] of enEntries) {
      expect(placeholders(ptCatalog[key]), key).toEqual(placeholders(value));
    }
  });

  it('plural keys come in _one/_other pairs in both languages', () => {
    for (const key of Object.keys(ptCatalog)) {
      if (key.endsWith('_one')) {
        const base = key.slice(0, -'_one'.length);
        expect(en[`${base}_other` as keyof typeof en], key).toBeDefined();
        expect(ptCatalog[`${base}_other`], key).toBeDefined();
      }
    }
  });
});
