"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CloudUploadIcon,
  CopyXIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { useUploadDialogStore, useUploadQueueStore } from "@/stores/ui";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropZone, EmptyHint, RejectionNote, TaskList, TaskRow } from "./upload-dialog.styles";

/**
 * Upload dialog: every file input path converges here — picker button,
 * drag-and-drop across the whole surface, and clipboard paste — with one
 * shared validation path (photos and videos; size caps come from NEXT_PUBLIC_*
 * env and videos are unlimited by default).
 */
export function UploadDialog() {
  const open = useUploadDialogStore((s) => s.open);
  const hide = useUploadDialogStore((s) => s.hide);
  const tasks = useUploadQueueStore((s) => s.tasks);
  const lastRejection = useUploadQueueStore((s) => s.lastRejection);
  const enqueue = useUploadQueueStore((s) => s.enqueue);
  const clearFinished = useUploadQueueStore((s) => s.clearFinished);

  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const collect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    enqueue(Array.from(files));
  };

  // Clipboard paste is one of the three input paths while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (event: ClipboardEvent) => {
      collect(event.clipboardData?.files ?? null);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enqueue]);

  const busy = tasks.some((t) => t.status === "uploading" || t.status === "queued");
  const hasFinished = tasks.some(
    (t) => t.status === "done" || t.status === "duplicated" || t.status === "error",
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && hide()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload photos and videos</DialogTitle>
          <DialogDescription>
            Drop photos or videos here, paste from the clipboard, or browse your files.
          </DialogDescription>
        </DialogHeader>
        <DropZone
          $dragging={dragging}
          onDragOver={(event: React.DragEvent) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event: React.DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(event: React.DragEvent) => {
            event.preventDefault();
            setDragging(false);
            collect(event.dataTransfer.files);
          }}
        >
          {tasks.length === 0 ? (
            <EmptyHint>
              <CloudUploadIcon aria-hidden />
              <p>No files selected yet.</p>
              <Button variant="outline" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
            </EmptyHint>
          ) : (
            <TaskList>
              {tasks.map((task) => (
                <TaskRow key={task.id} data-status={task.status}>
                  <div className="name">
                    <strong>{task.name}</strong>
                    <span>
                      {task.status === "error" && task.message
                        ? task.message
                        : task.status === "done"
                          ? "Uploaded"
                          : task.status === "duplicated"
                            ? "Already in your library"
                            : `${Math.round(task.progress * 100)}% · ${formatBytes(task.sizeBytes)}`}
                    </span>
                  </div>
                  {task.status === "uploading" || task.status === "queued" ? (
                    <Progress
                      value={Math.round(task.progress * 100)}
                      aria-label={`Uploading ${task.name}`}
                      className="w-24"
                    />
                  ) : (
                    <span className="state" aria-hidden>
                      {task.status === "done" ? (
                        <CheckIcon className="size-4" />
                      ) : task.status === "duplicated" ? (
                        <CopyXIcon className="size-4" />
                      ) : task.status === "error" ? (
                        <TriangleAlertIcon className="size-4" />
                      ) : (
                        <Loader2Icon className="size-4 animate-spin" />
                      )}
                    </span>
                  )}
                </TaskRow>
              ))}
            </TaskList>
          )}
          {lastRejection ? <RejectionNote role="alert">{lastRejection}</RejectionNote> : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              collect(event.target.files);
              event.target.value = "";
            }}
          />
        </DropZone>
        <DialogFooter>
          {hasFinished ? (
            <Button variant="ghost" onClick={clearFinished}>
              Clear finished
            </Button>
          ) : null}
          <Button variant="outline" onClick={hide} disabled={false}>
            {busy ? "Continue in background" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
