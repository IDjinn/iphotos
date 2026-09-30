import { create } from 'zustand';

/**
 * Multi-select state shared by every grid (Photos, albums, search,
 * Locked Folder). `begin` is triggered by a long press.
 */
interface SelectionState {
  active: boolean;
  ids: string[];
  idSet: Set<string>;
  begin: (firstId: string) => void;
  toggle: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clear: () => void;
  end: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  active: false,
  ids: [],
  idSet: new Set<string>(),
  begin: (firstId) => set({ active: true, ids: [firstId], idSet: new Set([firstId]) }),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.idSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: [...next], idSet: next, active: next.size > 0 };
    }),
  selectMany: (ids) => set({ active: true, ids, idSet: new Set(ids) }),
  clear: () => set({ active: false, ids: [], idSet: new Set<string>() }),
  end: () => set({ active: false, ids: [], idSet: new Set<string>() }),
}));
