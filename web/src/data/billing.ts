import { apiJson } from "@/data/api-client";

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
export type BillingState = "Free" | "Active" | "Grace" | "Expired";

export interface BillingStatus {
  /** Product id of the current plan, or "free". */
  plan: string;
  state: BillingState;
  quotaBytes: number;
  /** End of the current term (or of the last term, once expired). */
  expiresAt?: string | null;
}

export async function getBillingCatalog(): Promise<BillingCatalog> {
  return apiJson<BillingCatalog>("/api/billing/products");
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return apiJson<BillingStatus>("/api/billing/status");
}

/** Confirms a store purchase with the backend; returns the refreshed status. */
export async function verifyPurchase(productId: string, purchaseToken: string): Promise<BillingStatus> {
  return apiJson<BillingStatus>("/api/billing/verify", {
    method: "POST",
    body: { productId, purchaseToken },
  });
}

/** Revalidates a purchase already linked to the account (reinstalls). */
export async function restorePurchase(purchaseToken: string): Promise<BillingStatus> {
  return apiJson<BillingStatus>("/api/billing/restore", {
    method: "POST",
    body: { purchaseToken },
  });
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Sandbox-only purchase token. Real store purchases hand the app a purchase
 * token from the native billing sheet; the sandbox backend accepts tokens it
 * can verify (see the billing provider configuration).
 */
export function sandboxPurchaseToken(): string {
  return `test_${randomUuid()}`;
}

const PURCHASE_TOKEN_KEY = "billing.purchaseToken.v1";

/**
 * Keeps the store's purchase token on this device — the local stand-in for the
 * store account's purchase history that "restore" revalidates against.
 */
export function rememberPurchaseToken(token: string): void {
  try {
    localStorage.setItem(PURCHASE_TOKEN_KEY, token);
  } catch {
    // Storage unavailable — restore simply won't remember the token.
  }
}

export function lastPurchaseToken(): string | null {
  try {
    return localStorage.getItem(PURCHASE_TOKEN_KEY);
  } catch {
    return null;
  }
}
