"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";

/** Wraps public pages: signed-in users are sent straight to the gallery. */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "signed-in") router.replace("/photos");
  }, [status, router]);

  if (status === "signed-in") return null;
  return <>{children}</>;
}
