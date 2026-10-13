import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Connectivity tracking (frontend-only concern — the backend contract never
 * sees connectivity state). `offlineNow` starts optimistic (online) until the
 * first state arrives; airplane-mode and no-connection both count as offline.
 */

let offlineNow = false;
let initialized = false;
const listeners = new Set<(offline: boolean) => void>();

function setOffline(offline: boolean): void {
  if (offline === offlineNow) return;
  offlineNow = offline;
  for (const listener of listeners) listener(offline);
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  NetInfo.addEventListener((state) => {
    setOffline(!(state.isConnected === true && state.isInternetReachable !== false));
  });
  void NetInfo.fetch().then((state) => {
    setOffline(!(state.isConnected === true && state.isInternetReachable !== false));
  });
}

/** Non-reactive check for effects and prefetch paths. */
export function isOfflineNow(): boolean {
  ensureInitialized();
  return offlineNow;
}

function subscribe(listener: (offline: boolean) => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive flag for render paths — true while the device has no connection. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(isOfflineNow);
  useEffect(() => subscribe(setOffline), []);
  return offline;
}
