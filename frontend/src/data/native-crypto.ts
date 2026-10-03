import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Runtime gate for native-only packages (react-native-quick-crypto,
 * onnxruntime-react-native): neither ships inside Expo Go, so a plain
 * `expo start` session must never evaluate them. Metro reports module-scope
 * failures from missing native bindings as fatal crashes that no try/catch
 * can catch (see ml/vision-session.ts) — the require() here therefore only
 * runs in dev/production builds, never in Expo Go.
 */

type QuickCrypto = typeof import('react-native-quick-crypto');

/**
 * Byte-oriented view of the quick-crypto surface used by the app, typed
 * against plain Uint8Array so callers can use the `buffer` package's Buffer
 * (quick-crypto's own Buffer type is a different class).
 */
export interface NativeCryptoApi {
  createHash(algorithm: 'sha256'): {
    update(data: Uint8Array): unknown;
    digest(encoding: 'hex'): string;
  };
  randomBytes(size: number): Uint8Array;
  pbkdf2Sync(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
    digest: string
  ): Uint8Array;
  createCipheriv(
    algorithm: 'aes-256-gcm',
    key: Uint8Array,
    iv: Uint8Array
  ): {
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
    getAuthTag(): Uint8Array;
  };
  createDecipheriv(
    algorithm: 'aes-256-gcm',
    key: Uint8Array,
    iv: Uint8Array
  ): {
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
    setAuthTag(tag: Uint8Array): void;
  };
  install(): void;
}

/** True when running inside the Expo Go client (no custom native modules). */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export class NativeCryptoUnavailableError extends Error {
  constructor() {
    super(
      'native crypto unavailable — this feature requires a native build (expo run:android)'
    );
    this.name = 'NativeCryptoUnavailableError';
  }
}

let quickCrypto: QuickCrypto | null | undefined;

/**
 * Quick-crypto module in native builds (globals installed once), or null in
 * Expo Go. The package is never evaluated inside Expo Go.
 */
export function loadQuickCrypto(): QuickCrypto | null {
  if (isExpoGo) return null;
  if (quickCrypto === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-quick-crypto') as QuickCrypto;
    mod.install();
    quickCrypto = mod;
  }
  return quickCrypto;
}

/** Native crypto in native builds; throws NativeCryptoUnavailableError in Expo Go. */
export function requireNativeCrypto(): NativeCryptoApi {
  const mod = loadQuickCrypto();
  if (!mod) throw new NativeCryptoUnavailableError();
  return mod as unknown as NativeCryptoApi;
}

/** Whether the native crypto stack is usable in the current runtime. */
export function isNativeCryptoAvailable(): boolean {
  return loadQuickCrypto() !== null;
}
