"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isCancel } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadPhoto } from "@/data/cloud-photos-repository";
import { ApiError } from "@/data/api-client";
import { getFileForTask, useUploadQueueStore } from "@/stores/ui";

/**
 * Processes the upload queue sequentially (one file at a time), regardless of
 * whether the upload dialog is open — the queue keeps running in background.
 */
export function UploadProcessor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tasks = useUploadQueueStore((s) => s.tasks);
  const patch = useUploadQueueStore((s) => s.patch);
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current) return;
    const next = tasks.find((task) => task.status === "queued");
    if (!next) return;

    runningRef.current = true;
    const file = getFileForTask(next.id);
    void (async () => {
      if (!file) {
        patch(next.id, { status: "error", message: "Upload failed. Try again." });
        return;
      }
      patch(next.id, { status: "uploading", progress: 0 });
      try {
        const outcome = await uploadPhoto(file, {
          onProgress: (progress) =>
            patch(next.id, {
              progress: progress.totalBytes > 0 ? progress.sentBytes / progress.totalBytes : 0,
            }),
        });
        patch(next.id, {
          status: outcome.duplicated ? "duplicated" : "done",
          progress: 1,
        });
        void queryClient.invalidateQueries({ queryKey: ["photos"] });
        void queryClient.invalidateQueries({ queryKey: ["usage"] });
      } catch (error) {
        if (isCancel(error)) {
          patch(next.id, { status: "queued", progress: 0 });
        } else if (error instanceof ApiError && error.status === 413) {
          patch(next.id, {
            status: "error",
            quotaExceeded: true,
            message: "Storage is full — free up space or upgrade your plan.",
          });
          toast.error("Storage is full", {
            action: { label: "View plans", onClick: () => router.push("/subscription") },
          });
        } else if (error instanceof ApiError) {
          patch(next.id, {
            status: "error",
            message: error.message || "Upload failed. Try again.",
          });
        } else {
          patch(next.id, { status: "error", message: "Upload failed. Try again." });
        }
      } finally {
        runningRef.current = false;
        // Every path above patched the task, so the state change re-runs this
        // effect and picks up the next queued file.
      }
    })();
  }, [tasks, patch, queryClient, router]);

  return null;
}
