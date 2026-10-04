import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

const STORAGE_KEY = "iphotos.theme";

export function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" || raw === "system" ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "dark",
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage unavailable (private mode) — theme still applies for this session.
    }
    applyTheme(mode);
    set({ mode });
  },
}));
