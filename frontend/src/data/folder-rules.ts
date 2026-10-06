/**
 * Folder sync rules decision table — docs/plans/04-pastas-sync-ignore.md §2.
 * Pure logic (no db / RN imports) so the precedence and reconciliation
 * decisions are unit-testable in isolation.
 */

/** Mode persisted in the `sync_rules` table. */
export type FolderRuleMode = 'include' | 'exclude';

/** General policy applied to folders the scan sees for the first time (§2.2). */
export type NewFolderPolicy = 'ask' | 'include' | 'exclude';

export const DEFAULT_NEW_FOLDER_POLICY: NewFolderPolicy = 'ask';

/** What an inventory scan does with one folder (§2.3 precedence). */
export type FolderScanAction = 'include' | 'exclude' | 'hold';

/**
 * Out-of-the-cycle reasons recorded on `backup_inventory.last_error`. The
 * inventory state machine has no "held" state — folders awaiting a decision
 * use `excluded` with the hold reason, so hashing and uploading never pick
 * them up (§5: "fica pending sem entrar na fila", via the same mechanism).
 */
export const FOLDER_RULE_EXCLUSION_REASON = 'folder rule';
export const FOLDER_HOLD_EXCLUSION_REASON = 'awaiting folder decision';
/** Reserved by the hashing step for formats the backend cannot ingest. */
export const UNSUPPORTED_FORMAT_EXCLUSION_REASON = 'unsupported format';

/** Exclusion reasons that folder rules own and may reverse. */
const RULE_OWNED_REASONS = new Set([FOLDER_RULE_EXCLUSION_REASON, FOLDER_HOLD_EXCLUSION_REASON]);

export interface FolderDecisionInput {
  /** Rule persisted for this folder, if any — a specific rule always wins. */
  rule?: FolderRuleMode | null;
  /** True when no prior scan has decided this folder (not known, not held). */
  isNew: boolean;
  policy: NewFolderPolicy;
}

/**
 * Precedence (§2.3): locked folders are hard-excluded before this runs;
 * then the specific rule; then the new-folder policy for unseen folders
 * (`ask` holds them out of the queue until the user decides); then the
 * default include.
 */
export function decideFolder(input: FolderDecisionInput): FolderScanAction {
  if (input.rule) return input.rule;
  if (input.isNew) {
    if (input.policy === 'exclude') return 'exclude';
    if (input.policy === 'ask') return 'hold';
  }
  return 'include';
}

/** True when a rule change is allowed to bring this row back into the cycle. */
export function isRuleOwnedExclusion(lastError: string | null): boolean {
  return lastError === null || RULE_OWNED_REASONS.has(lastError);
}

/**
 * State of a repended row after a folder returns to the backup cycle (§4):
 * items that already have a valid content hash go straight to the queue —
 * they are never re-hashed — the rest wait for hashing.
 */
export function stateAfterInclude(hasHash: boolean): 'queued' | 'pending' {
  return hasHash ? 'queued' : 'pending';
}
