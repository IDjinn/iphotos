import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm action as the destructive (danger-filled) button. */
  destructive?: boolean;
}

interface ConfirmState {
  /** Currently displayed dialog; null when closed. */
  request: (ConfirmOptions & { id: number }) | null;
  /** Opens the glass confirm dialog; resolves true on confirm, false on cancel. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Called by the host when the user picks an action. */
  settle: (id: number, accepted: boolean) => void;
}

let pendingId = 0;
let pendingResolve: ((accepted: boolean) => void) | null = null;

/**
 * Global confirmation dialog state. Mirrors the viewer overlay pattern:
 * any screen or hook can await a glass-styled confirm without owning
 * dialog UI. One dialog at a time — a new confirm settles the previous
 * one as declined.
 */
export const useConfirmStore = create<ConfirmState>()((set) => ({
  request: null,
  confirm: (options) => {
    pendingResolve?.(false);
    const id = ++pendingId;
    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
      set({ request: { ...options, id } });
    });
  },
  settle: (id, accepted) => {
    set((state) => (state.request?.id === id ? { request: null } : {}));
    if (pendingResolve) {
      pendingResolve(accepted);
      pendingResolve = null;
    }
  },
}));

/** Fire-and-forget helper for call sites that don't consume the answer. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm(options);
}
