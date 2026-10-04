"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { ShellSkeleton } from "@/components/shell/app-shell";

/**
 * Client-side gate for the app routes: while the session is being restored the
 * content area shows a skeleton that matches the final layout; a signed-out
 * state redirects to login. The shell chrome stays mounted underneath.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "signed-out") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "signed-in") {
    return <ShellSkeleton />;
  }

  return <>{children}</>;
}
