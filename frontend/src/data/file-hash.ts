import { Buffer, createHash } from 'react-native-quick-crypto';
import { File, FileMode } from 'expo-file-system';

const CHUNK_SIZE = 1024 * 1024;

/**
 * SHA-256 of a file read in 1 MB chunks, so large photos never sit whole in
 * memory. The hex digest matches the server-side `contentHash` used for
 * per-account dedup (docs/plans/09-backend-api.md §3.2). Null when unreadable.
 */
export async function sha256File(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    const hash = createHash('sha256');
    const input = file.open(FileMode.ReadOnly);
    try {
      const total = input.size ?? file.size;
      let read = 0;
      while (read < total) {
        const chunk = input.readBytes(Math.min(CHUNK_SIZE, total - read));
        if (chunk.length === 0) break;
        read += chunk.length;
        hash.update(Buffer.from(chunk));
      }
    } finally {
      input.close();
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}
