import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { db } from './db';

const CONFIG_KEY = 'lockedFolder.config.v1';

export interface LockedFolderConfig {
  enabled: boolean;
  /** SHA-256(salt + pin), never the raw PIN. */
  pinHash?: string;
  salt?: string;
  /** Whether biometric unlock is allowed. */
  biometric: boolean;
}

export function getLockedIds(): Set<string> {
  const rows = db.getAllSync<{ asset_id: string }>('SELECT asset_id FROM locked_assets');
  return new Set(rows.map((r) => r.asset_id));
}

export function getLockedIdList(): string[] {
  const rows = db.getAllSync<{ asset_id: string }>(
    'SELECT asset_id FROM locked_assets ORDER BY moved_at DESC'
  );
  return rows.map((r) => r.asset_id);
}

export function addToLockedFolder(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const now = Date.now();
  db.withTransactionSync(() => {
    for (const id of assetIds) {
      db.runSync('INSERT OR IGNORE INTO locked_assets (asset_id, moved_at) VALUES (?, ?)', [id, now]);
    }
  });
}

export function removeFromLockedFolder(assetIds: string[]): void {
  if (assetIds.length === 0) return;
  const placeholders = assetIds.map(() => '?').join(',');
  db.runSync(`DELETE FROM locked_assets WHERE asset_id IN (${placeholders})`, assetIds);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function readLockedConfig(): Promise<LockedFolderConfig> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY).catch(() => null);
  if (!raw) return { enabled: false, biometric: false };
  try {
    return JSON.parse(raw) as LockedFolderConfig;
  } catch {
    return { enabled: false, biometric: false };
  }
}

export async function writeLockedConfig(config: LockedFolderConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
}

export async function setupLockedFolder(pin: string, biometric: boolean): Promise<void> {
  const salt = Crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  await writeLockedConfig({ enabled: true, pinHash, salt, biometric });
}

export async function verifyPin(pin: string, config: LockedFolderConfig): Promise<boolean> {
  if (!config.pinHash || !config.salt) return false;
  const candidate = await hashPin(pin, config.salt);
  return candidate === config.pinHash;
}
