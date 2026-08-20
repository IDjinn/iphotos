import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import {
  Buffer,
  createCipheriv,
  createDecipheriv,
  install as installQuickCrypto,
  pbkdf2Sync,
  randomBytes,
} from 'react-native-quick-crypto';

import { purgeDirectory } from './vault-crypto';

/**
 * Password-derived key material for the encrypted offline mode
 * (docs/plans/13-encrypted-mode.md).
 *
 * A random 256-bit data key encrypts the files. The data key itself is
 * wrapped with an AES-256-GCM key derived from the user's password via
 * PBKDF2-SHA256 (200k iterations), so nothing on disk can be decrypted
 * without the password. The unwrapped key lives in memory only, for the
 * duration of an unlocked session.
 */

installQuickCrypto();

const CONFIG_KEY = 'encryptedMode.key.v1';
const PBKDF2_ITERATIONS = 200_000;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

interface WrappedKeyConfig {
  salt: string;
  iv: string;
  wrapped: string;
}

let sessionKey: Buffer | null = null;

function deriveKek(password: string, salt: Buffer): Buffer {
  return Buffer.from(pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256'));
}

function wrapDataKey(dataKey: Buffer, kek: Buffer): WrappedKeyConfig {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final(), cipher.getAuthTag()]);
  return { salt: '', iv: iv.toString('base64'), wrapped: wrapped.toString('base64') };
}

/** Creates (or replaces) the password-protected data key. */
export async function setupPassword(password: string): Promise<void> {
  const salt = randomBytes(16);
  const kek = deriveKek(password, salt);
  const dataKey = randomBytes(32);
  const config = wrapDataKey(dataKey, kek);
  config.salt = salt.toString('base64');
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
  sessionKey = dataKey;
}

export async function readKeyConfig(): Promise<WrappedKeyConfig | null> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WrappedKeyConfig;
  } catch {
    return null;
  }
}

/** True once a password has been set up (mode enabled), regardless of session. */
export async function isEncryptedModeConfigured(): Promise<boolean> {
  return (await readKeyConfig()) !== null;
}

/**
 * Unwraps the data key with `password`. Returns false on a wrong password
 * (GCM tag mismatch) instead of throwing, so the UI can just re-prompt.
 */
export async function unlockWithPassword(password: string): Promise<boolean> {
  const config = await readKeyConfig();
  if (!config) return false;
  try {
    const kek = deriveKek(password, Buffer.from(config.salt, 'base64'));
    const raw = Buffer.from(config.wrapped, 'base64');
    const iv = Buffer.from(config.iv, 'base64');
    const ciphertext = raw.subarray(0, raw.length - TAG_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);
    sessionKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return true;
  } catch {
    return false;
  }
}

/** Drops the in-memory key and wipes decrypted plaintext from the cache. */
export function lockSession(): void {
  sessionKey = null;
  purgeDirectory(encryptedSessionCache());
}

export function isSessionUnlocked(): boolean {
  return sessionKey !== null;
}

/** Data key for file (en|de)cryption — throws when the session is locked. */
export function getSessionKey(): Buffer {
  if (!sessionKey) throw new Error('encrypted-mode: session is locked');
  return sessionKey;
}

/** Removes the key config entirely (called after decrypting everything back). */
export async function destroyKeyConfig(): Promise<void> {
  sessionKey = null;
  await SecureStore.deleteItemAsync(CONFIG_KEY).catch(() => undefined);
}

/** App-private directory holding the encrypted originals. */
export function encryptedDirectory(): Directory {
  return new Directory(Paths.document, 'encrypted');
}

/** Decrypted plaintext lives here only while the session is unlocked. */
export function encryptedSessionCache(): Directory {
  return new Directory(Paths.cache, 'encrypted-session');
}

export function ensureEncryptedDirectories(): void {
  encryptedDirectory().create({ intermediates: true, idempotent: true });
  encryptedSessionCache().create({ intermediates: true, idempotent: true });
}

export function encryptedFile(assetId: string, thumbnail = false): File {
  return new File(encryptedDirectory(), `${assetId}${thumbnail ? '.thumb' : ''}.bin`);
}

export function encryptedCacheFile(name: string): File {
  return new File(encryptedSessionCache(), name);
}
