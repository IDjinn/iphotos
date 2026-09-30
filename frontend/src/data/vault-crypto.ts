import * as SecureStore from 'expo-secure-store';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import {
  Buffer,
  createCipheriv,
  createDecipheriv,
  install as installQuickCrypto,
  randomBytes,
} from 'react-native-quick-crypto';

/**
 * AES-256-GCM file encryption for the Locked Folder vault.
 *
 * File format: [ IV (12 bytes) | ciphertext | GCM tag (16 bytes) ].
 * The key is a random 256-bit data key stored in SecureStore (hardware-backed
 * keystore); the PIN/biometric gate in the Locked Folder UI controls access.
 * Future hardening (out of scope now): wrap the data key with PBKDF2(PIN).
 */

installQuickCrypto();

const KEY_STORAGE = 'vault.key.v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const CHUNK_SIZE = 1024 * 1024;

let cachedKey: Buffer | null = null;

/** Random 256-bit data key, created once and kept in SecureStore. */
export async function getVaultKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const stored = await SecureStore.getItemAsync(KEY_STORAGE).catch(() => null);
  if (stored) {
    cachedKey = Buffer.from(stored, 'base64');
  } else {
    const key = randomBytes(32);
    await SecureStore.setItemAsync(KEY_STORAGE, key.toString('base64'));
    cachedKey = key;
  }
  return cachedKey;
}

/** Directory holding the encrypted vault files (app-private storage). */
export function vaultDirectory(): Directory {
  return new Directory(Paths.document, 'vault');
}

/**
 * Directory holding decrypted plaintext, only while the Locked Folder
 * session is unlocked. Purged on every re-lock.
 */
export function vaultSessionCache(): Directory {
  return new Directory(Paths.cache, 'vault-session');
}

export function ensureVaultDirectories(): void {
  vaultDirectory().create({ intermediates: true, idempotent: true });
  vaultSessionCache().create({ intermediates: true, idempotent: true });
}

/** Encrypts the file at `srcUri` into `dest` using a fresh per-file IV. */
export async function encryptFile(srcUri: string, dest: File, explicitKey?: Buffer): Promise<void> {
  const key = explicitKey ?? (await getVaultKey());
  const src = new File(srcUri);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  dest.create({ intermediates: true, overwrite: true });
  const out = dest.open(FileMode.WriteOnly);
  try {
    out.writeBytes(iv);
    const input = src.open(FileMode.ReadOnly);
    try {
      const total = input.size ?? src.size;
      let read = 0;
      while (read < total) {
        const chunk = input.readBytes(Math.min(CHUNK_SIZE, total - read));
        if (chunk.length === 0) break;
        read += chunk.length;
        const encrypted = cipher.update(Buffer.from(chunk));
        if (encrypted.length > 0) out.writeBytes(encrypted);
      }
    } finally {
      input.close();
    }
    const tail = cipher.final();
    if (tail.length > 0) out.writeBytes(tail);
    out.writeBytes(cipher.getAuthTag());
  } finally {
    out.close();
  }
}

/**
 * Decrypts the vault file `src` into `dest`. Rejects when the GCM tag does
 * not match (wrong key or corrupted file).
 */
export async function decryptFile(src: File, dest: File, explicitKey?: Buffer): Promise<void> {
  const key = explicitKey ?? (await getVaultKey());
  const total = src.size;
  if (total <= IV_LENGTH + TAG_LENGTH) throw new Error('vault: file too short');

  const input = src.open(FileMode.ReadOnly);
  try {
    const iv = input.readBytes(IV_LENGTH);
    const ciphertextLength = total - IV_LENGTH - TAG_LENGTH;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv));

    dest.create({ intermediates: true, overwrite: true });
    const out = dest.open(FileMode.WriteOnly);
    try {
      let read = 0;
      while (read < ciphertextLength) {
        const chunk = input.readBytes(Math.min(CHUNK_SIZE, ciphertextLength - read));
        if (chunk.length === 0) break;
        read += chunk.length;
        const decrypted = decipher.update(Buffer.from(chunk));
        if (decrypted.length > 0) out.writeBytes(decrypted);
      }
      decipher.setAuthTag(Buffer.from(input.readBytes(TAG_LENGTH)));
      const tail = decipher.final();
      if (tail.length > 0) out.writeBytes(tail);
    } finally {
      out.close();
    }
  } finally {
    input.close();
  }
}

/** Deletes every file inside `dir` (best-effort, never throws). */
export function purgeDirectory(dir: Directory): void {
  try {
    if (!dir.exists) return;
    for (const child of dir.list()) {
      try {
        child.delete();
      } catch {
        // Individual entries may fail while a viewer still holds them.
      }
    }
  } catch {
    // Missing/unreadable directory — nothing to purge.
  }
}

/** Wipes decrypted plaintext from the session cache. */
export function purgeVaultSessionCache(): void {
  purgeDirectory(vaultSessionCache());
}
