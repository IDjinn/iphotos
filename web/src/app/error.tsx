"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Full detail goes to the console only — never to the UI.
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold leading-tight">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Try again, or contact the administrator if the problem persists.
        </p>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
