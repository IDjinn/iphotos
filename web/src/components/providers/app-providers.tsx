"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onSessionExpired, restoreSession } from "@/data/api-client";
import { useAuthStore } from "@/stores/auth";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    let active = true;
    void restoreSession().then((ok) => {
      if (!active) return;
      if (ok) useAuthStore.getState().signedIn();
      else useAuthStore.getState().signedOut();
    });
    const off = onSessionExpired(() => useAuthStore.getState().signedOut());
    return () => {
      active = false;
      off();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
