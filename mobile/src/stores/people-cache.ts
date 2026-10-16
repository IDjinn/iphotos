import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ensureFaceCrop, getCachedFaceCropUri } from '@/data/cloud-media-cache';
import { sqliteStorage } from '@/data/kv-storage';
import type { Person } from '@/data/people-repository';

/** How many people the offline-first grid keeps — the head of the default
 * (unfiltered, named-first) listing. */
export const PEOPLE_CACHE_SIZE = 30;

interface PeopleCacheState {
  /** Head of the people listing, persisted in SQLite — the people hub paints
   * it on cold start instead of a skeleton, and the covers below are already
   * in the persistent face-crop cache, so the avatars never load late. */
  people: Person[] | null;
  setPeople: (people: Person[] | null) => void;
}

export const usePeopleCacheStore = create<PeopleCacheState>()(
  persist(
    (set) => ({
      people: null,
      setPeople: (people) => set({ people }),
    }),
    {
      name: 'people-cache',
      storage: createJSONStorage(() => sqliteStorage),
    },
  ),
);

/** Warms the persistent face-crop cache with the cached head's covers —
 * fire-and-forget (already-cached crops are skipped) and throttled by the
 * global download semaphore in `cloud-media-cache`. */
export function prefetchPeopleCovers(people: Person[]): void {
  for (const person of people) {
    if (!person.coverFaceId) continue;
    if (getCachedFaceCropUri(person.coverFaceId)) continue;
    void ensureFaceCrop(person.coverFaceId).catch(() => undefined);
  }
}
