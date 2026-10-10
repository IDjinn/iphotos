import { useCallback, useState } from "react";

const DISMISSED_KEY = "iphotos.dismissed-person-suggestions";

function loadDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persisted "Not now" state for the "same person?" review (doc 18 §7.4), keyed
 * by the backend's stable suggestion ids. Shared by the people hub and the
 * person page, where the review now lives — dismissing on one screen sticks on
 * the other.
 */
export function useSuggestionDismissals() {
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // Private mode — dismissal lasts for the session only.
      }
      return next;
    });
  }, []);

  return { dismissed, dismiss };
}
