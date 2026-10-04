"use client";

import { useEffect } from "react";
import { applyTheme, readStoredMode, useThemeStore } from "@/stores/theme";

// Syncs the store with what the pre-paint script applied (no visual flash) and
// keeps "system" mode following the OS preference.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = readStoredMode();
    useThemeStore.setState({ mode: stored });
    applyTheme(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (useThemeStore.getState().mode === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return <>{children}</>;
}
