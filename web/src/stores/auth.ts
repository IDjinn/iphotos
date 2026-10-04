import { create } from "zustand";
import type { AuthUser } from "@/data/api-client";

const USER_KEY = "auth.user.v1";

export type AuthStatus = "restoring" | "signed-in" | "signed-out";

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return parsed && typeof parsed.email === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Storage unavailable — the profile simply isn't remembered.
  }
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Records the signed-in user (called by login/register flows and restore). */
  signedIn: (user?: AuthUser) => void;
  signedOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "restoring",
  user: null,
  signedIn: (user) =>
    set((state) => {
      const next = user ?? state.user ?? readStoredUser();
      writeStoredUser(next);
      return { status: "signed-in", user: next };
    }),
  signedOut: () => {
    writeStoredUser(null);
    set({ status: "signed-out", user: null });
  },
}));
