import type { StateStorage } from 'zustand/middleware';

import { kv } from './db';

/**
 * Synchronous SQLite-backed storage adapter for zustand `persist`.
 * SQLite ops are sync here, so rehydration resolves on first read.
 */
export const sqliteStorage: StateStorage = {
  getItem: (name) => kv.get(name),
  setItem: (name, value) => kv.set(name, value),
  removeItem: (name) => kv.remove(name),
};
