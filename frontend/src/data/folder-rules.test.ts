import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NEW_FOLDER_POLICY,
  FOLDER_HOLD_EXCLUSION_REASON,
  FOLDER_RULE_EXCLUSION_REASON,
  UNSUPPORTED_FORMAT_EXCLUSION_REASON,
  decideFolder,
  isRuleOwnedExclusion,
  stateAfterInclude,
} from './folder-rules';

/**
 * Folder sync rules decision table — docs/plans/04-pastas-sync-ignore.md §2.3/§4/§5.
 * These tests pin the precedence contract and the reconciliation guarantees
 * the inventory scan and repository rely on (task 4.8).
 */

describe('decideFolder', () => {
  it('an explicit exclude rule wins over policy and known state', () => {
    expect(decideFolder({ rule: 'exclude', isNew: true, policy: 'include' })).toBe('exclude');
    expect(decideFolder({ rule: 'exclude', isNew: false, policy: 'include' })).toBe('exclude');
  });

  it('an explicit include rule wins over policy and known state', () => {
    expect(decideFolder({ rule: 'include', isNew: true, policy: 'exclude' })).toBe('include');
    expect(decideFolder({ rule: 'include', isNew: false, policy: 'exclude' })).toBe('include');
  });

  it('a new folder under the default ask policy is held out of the queue', () => {
    expect(DEFAULT_NEW_FOLDER_POLICY).toBe('ask');
    expect(decideFolder({ rule: null, isNew: true, policy: 'ask' })).toBe('hold');
  });

  it('new folders follow include/exclude policies without asking', () => {
    expect(decideFolder({ rule: null, isNew: true, policy: 'include' })).toBe('include');
    expect(decideFolder({ rule: null, isNew: true, policy: 'exclude' })).toBe('exclude');
  });

  it('known folders default to include regardless of the ask policy', () => {
    expect(decideFolder({ rule: null, isNew: false, policy: 'ask' })).toBe('include');
  });
});

describe('isRuleOwnedExclusion', () => {
  it('treats missing and rule-owned reasons as reversible', () => {
    expect(isRuleOwnedExclusion(null)).toBe(true);
    expect(isRuleOwnedExclusion(FOLDER_RULE_EXCLUSION_REASON)).toBe(true);
    expect(isRuleOwnedExclusion(FOLDER_HOLD_EXCLUSION_REASON)).toBe(true);
  });

  it('never revives format-based exclusions', () => {
    expect(isRuleOwnedExclusion(UNSUPPORTED_FORMAT_EXCLUSION_REASON)).toBe(false);
  });
});

describe('stateAfterInclude', () => {
  it('rows that kept a valid hash go straight to the queue — never re-hashed', () => {
    expect(stateAfterInclude(true)).toBe('queued');
  });

  it('rows without a hash wait for the hashing phase', () => {
    expect(stateAfterInclude(false)).toBe('pending');
  });
});
