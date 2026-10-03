import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Buffer } from 'buffer';
import { File, FileMode } from 'expo-file-system';

import { loadQuickCrypto } from './native-crypto';

const CHUNK_SIZE = 1024 * 1024;

/**
 * SHA-256 of a file read in 1 MB chunks, so large photos never sit whole in
 * memory. The hex digest matches the server-side `contentHash` used for
 * per-account dedup (docs/plans/09-backend-api.md §3.2). Null when unreadable.
 *
 * Uses react-native-quick-crypto in native builds; falls back to the pure-JS
 * @noble/hashes implementation inside Expo Go (same digest, just slower).
 */
export async function sha256File(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    const native = loadQuickCrypto();
    const nativeHash = native ? native.createHash('sha256') : null;
    const jsHash = nativeHash ? null : sha256.create();
    const input = file.open(FileMode.ReadOnly);
    try {
      const total = input.size ?? file.size;
      let read = 0;
      while (read < total) {
        const chunk = input.readBytes(Math.min(CHUNK_SIZE, total - read));
        if (chunk.length === 0) break;
        read += chunk.length;
        if (nativeHash) nativeHash.update(Buffer.from(chunk));
        else jsHash!.update(chunk);
      }
    } finally {
      input.close();
    }
    return nativeHash ? nativeHash.digest('hex') : bytesToHex(jsHash!.digest());
  } catch {
    return null;
  }
}
