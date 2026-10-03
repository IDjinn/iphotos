import * as Crypto from 'expo-crypto';

import { apiJson } from '@/data/api-client';
import { kv } from '@/data/db';

/**
 * Cloud subscription catalog and status — the app never decides plan or quota
 * rules; it renders what the billing contract returns and verifies store
 * purchases through the backend.
 */

export interface BillingProduct {
  productId: string;
  displayName: string;
  /** Presentation-only price label from the contract (e.g. "$15/month"). */
  displayPrice: string;
  quotaBytes: number;
}

export interface BillingCatalog {
  /** True when purchases are simulated in this environment (no real charge). */
  sandbox: boolean;
  products: BillingProduct[];
}

/** Server casing — enums arrive as PascalCase strings (same convention as PhotoState). */
export type BillingState = 'Free' | 'Active' | 'Grace' | 'Expired';

export interface BillingStatus {
  /** Product id of the current plan, or "free". */
  plan: string;
  state: BillingState;
  quotaBytes: number;
  /** End of the current term (or of the last term, once expired). */
  expiresAt?: string | null;
}

export async function getBillingCatalog(): Promise<BillingCatalog> {
  return apiJson<BillingCatalog>('/api/billing/products');
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return apiJson<BillingStatus>('/api/billing/status');
}

/** Confirms a store purchase with the backend; returns the refreshed status. */
export async function verifyPurchase(productId: string, purchaseToken: string): Promise<BillingStatus> {
  return apiJson<BillingStatus>('/api/billing/verify', {
    method: 'POST',
    body: { productId, purchaseToken },
  });
}

/** Revalidates a purchase already linked to the account (reinstalls). */
export async function restorePurchase(purchaseToken: string): Promise<BillingStatus> {
  return apiJson<BillingStatus>('/api/billing/restore', {
    method: 'POST',
    body: { purchaseToken },
  });
}

/**
 * Sandbox-only purchase token. Real store purchases hand the app a purchase
 * token from the native billing sheet; the sandbox backend accepts tokens it
 * can verify (see the billing provider configuration).
 */
export function sandboxPurchaseToken(): string {
  return `test_${Crypto.randomUUID()}`;
}

const PURCHASE_TOKEN_KEY = 'billing.purchaseToken.v1';

/**
 * Keeps the store's purchase token on this device — the local stand-in for the
 * store account's purchase history that "restore" revalidates against.
 */
export function rememberPurchaseToken(token: string): void {
  kv.set(PURCHASE_TOKEN_KEY, token);
}

export function lastPurchaseToken(): string | null {
  return kv.get(PURCHASE_TOKEN_KEY) ?? null;
}
