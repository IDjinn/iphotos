"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  FileArchiveIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { isCancel } from "axios";
import {
  createZipImportUpload,
  pollZipImport,
  type ZipImportJob,
  type ZipUploadHandle,
} from "@/data/import-repository";
import { ApiError } from "@/data/api-client";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageInner, PageScroll, PageTitle } from "@/components/shell/app-shell.styles";
import { DropZone } from "@/components/upload/upload-dialog.styles";
import { CounterGrid, Hint, JobHeader, SectionLabel } from "./import-panel.styles";

function looksLikeZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type.includes("zip");
}

/** Lifecycle of one archive within the batch. `queued`/`processing` mean the
 * archive is on the server and its import job is tracked independently of the
 * upload loop. */
type FileStatus =
  | "waiting"
  | "uploading"
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

interface BatchItem {
  file: File;
  status: FileStatus;
  /** 0..1 upload progress while `uploading`. */
  uploadFraction?: number;
  job?: ZipImportJob;
  message?: string;
}

const statusBadgeVariant = (status: FileStatus) =>
  status === "done"
    ? "secondary"
    : status === "failed"
      ? "destructive"
      : "default";

const statusLabel = (status: FileStatus) =>
  ({
    waiting: "Waiting",
    uploading: "Uploading…",
    queued: "Queued on server",
    processing: "Importing…",
    done: "Finished",
    failed: "Failed",
    canceled: "Canceled",
  })[status];

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "done") {
    return <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (status === "failed" || status === "canceled") {
    return <CircleXIcon aria-hidden className="size-4 shrink-0 text-destructive" />;
  }
  if (status === "uploading" || status === "processing") {
    return <Loader2Icon aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (status === "queued") {
    return <ClockIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <Loader2Icon aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-30" />;
}

const stateToStatus = (state: ZipImportJob["state"]): FileStatus =>
  state === "Queued" ? "queued" : state === "Processing" ? "processing" : state === "Done" ? "done" : "failed";

export function ImportPanel() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ZipUploadHandle | null>(null);
  const unmountedRef = useRef(false);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const patchItem = (index: number, patch: Partial<BatchItem>) => {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (looksLikeZip(file)) accepted.push(file);
      else rejected.push(file.name);
    }
    setValidation(
      rejected.length > 0
        ? `Skipped (not a zip archive): ${rejected.join(", ")}`
        : null,
    );
    if (accepted.length > 0) {
      setItems((current) => [
        ...current,
        ...accepted.map((file) => ({ file, status: "waiting" as const })),
      ]);
    }
  };

  // Clipboard paste is one of the input paths on this page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      pick(event.clipboardData?.files ?? null);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const start = async () => {
    setBusy(true);
    setStarted(true);
    stopRequestedRef.current = false;
    const finishedJobs: ZipImportJob[] = [];

    // Runs detached from the upload loop: as soon as the server accepts an
    // archive it keeps importing on its own, and this follows the job to its
    // terminal state.
    const trackJob = (index: number, jobId: string): Promise<void> =>
      pollZipImport(
        jobId,
        (update) => patchItem(index, { job: update, status: stateToStatus(update.state) }),
        { intervalMs: 2_000, shouldStop: () => unmountedRef.current },
      )
        .then((finished) => {
          if (finished.state === "Done") {
            finishedJobs.push(finished);
            patchItem(index, { status: "done", job: finished });
          } else {
            patchItem(index, {
              status: "failed",
              job: finished,
              message: finished.error || "The import didn't finish.",
            });
          }
        })
        .catch((caught: unknown) => {
          if (unmountedRef.current) return;
          patchItem(index, {
            status: "failed",
            message:
              caught instanceof ApiError && caught.message
                ? caught.message
                : "Lost track of this import — check the library later.",
          });
        });

    const pollTasks: Promise<void>[] = [];

    // Uploads run one at a time so each gets the full connection, but the
    // processing is never awaited here — the server queues accepted archives
    // and imports them in its own time.
    for (let index = 0; index < items.length; index += 1) {
      if (stopRequestedRef.current || unmountedRef.current) break;
      if (items[index].status !== "waiting") continue;
      patchItem(index, { status: "uploading", uploadFraction: 0, message: undefined });
      const handle = createZipImportUpload(
        items[index].file,
        (p) => patchItem(index, { uploadFraction: p.fraction }),
      );
      handleRef.current = handle;
      try {
        const jobId = await handle.jobIdPromise;
        patchItem(index, { status: "queued" });
        pollTasks.push(trackJob(index, jobId));
      } catch (caught) {
        if (isCancel(caught)) {
          patchItem(index, { status: "canceled", message: "Upload canceled." });
          break;
        }
        // One bad upload doesn't stop the rest of the batch — Takeout parts
        // are independent of each other.
        patchItem(index, {
          status: "failed",
          message:
            caught instanceof ApiError && caught.message
              ? caught.message
              : "The upload failed. Try again.",
        });
      } finally {
        handleRef.current = null;
      }
    }

    // Archives already accepted keep importing server-side (there is no cancel
    // API); follow them before reporting the batch as settled.
    await Promise.all(pollTasks);
    setBusy(false);
    // The library changed server-side (imports and even failures can add
    // photos); refresh the gallery/usage caches this panel doesn't own.
    await queryClient.invalidateQueries({ queryKey: ["photos"] });
    await queryClient.invalidateQueries({ queryKey: ["usage"] });
    if (finishedJobs.length > 0) {
      const photos = finishedJobs.reduce((sum, job) => sum + job.imported, 0);
      toast(
        `Import finished — ${photos} ${photos === 1 ? "photo" : "photos"} added across ${finishedJobs.length} ${finishedJobs.length === 1 ? "archive" : "archives"}`,
      );
    }
  };

  // Stops the upload queue: the current upload aborts and pending archives are
  // skipped, but archives already on the server keep importing.
  const stop = () => {
    stopRequestedRef.current = true;
    handleRef.current?.cancel();
    setItems((current) =>
      current.map((item) =>
        item.status === "waiting"
          ? { ...item, status: "canceled" as const, message: "Upload canceled." }
          : item,
      ),
    );
  };

  const reset = () => {
    setItems([]);
    setStarted(false);
    setValidation(null);
  };

  const pendingUploads = items.filter(
    (item) => item.status === "waiting" || item.status === "uploading",
  ).length;
  const running = started && items.some((item) => item.status !== "done" && item.status !== "failed" && item.status !== "canceled");
  const uploadedCount = items.filter((item) => item.job !== undefined).length;

  return (
    <PageScroll>
      <PageInner>
        <PageTitle>Import archives</PageTitle>

        {!started ? (
          <Card className="gap-4 p-6">
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
                pick(event.dataTransfer.files);
              }}
            >
              <EmptyState>
                <FileArchiveIcon aria-hidden />
                <p>
                  Drop one or more .zip archives here, paste them (Ctrl+V), or browse.
                  <br />
                  Photo archives like Google Takeout (all parts at once) are supported.
                </p>
                <Button variant="outline" onClick={() => inputRef.current?.click()}>
                  Browse files
                </Button>
              </EmptyState>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".zip,application/zip,application/x-zip-compressed"
                hidden
                onChange={(event) => {
                  pick(event.target.files);
                  event.target.value = "";
                }}
              />
            </DropZone>

            {items.length > 0 ? (
              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <FileRow key={`${item.file.name}-${index}`}>
                    <ArchiveIcon aria-hidden className="size-5 text-muted-foreground" />
                    <div className="meta">
                      <strong>{item.file.name}</strong>
                      <span>{formatBytes(item.file.size)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.file.name}`}
                      disabled={busy}
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2Icon aria-hidden className="size-4" />
                    </Button>
                  </FileRow>
                ))}
              </div>
            ) : null}

            {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}
            {!busy && items.length > 0 ? (
              <div className="flex justify-end">
                <Button onClick={() => void start()}>
                  <UploadIcon aria-hidden className="size-4" />
                  Import {items.length === 1 ? "archive" : `${items.length} archives`}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : (
          <Card className="gap-4 p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Archives</SectionLabel>
              {pendingUploads > 0 ? (
                <Button variant="ghost" size="sm" onClick={stop}>
                  Stop uploads
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {uploadedCount} of {items.length} archives uploaded
            </p>

            <div className="flex flex-col gap-3">
              {items.map((item, index) => (
                <div key={`${item.file.name}-${index}`} className="flex flex-col gap-1.5">
                  <JobHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusIcon status={item.status} />
                      <div className="meta min-w-0">
                        <strong className="truncate">{item.file.name}</strong>
                        <span>{formatBytes(item.file.size)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === "failed" || item.status === "canceled" ? (
                        <span
                          className="max-w-64 truncate text-xs text-muted-foreground"
                          title={item.message}
                        >
                          {item.message}
                        </span>
                      ) : null}
                      <Badge variant={statusBadgeVariant(item.status)}>
                        {statusLabel(item.status)}
                      </Badge>
                    </div>
                  </JobHeader>
                  {item.status === "uploading" ? (
                    <div className="flex items-center gap-2" aria-busy="true">
                      <Progress
                        value={Math.round((item.uploadFraction ?? 0) * 100)}
                        className="flex-1"
                      />
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {Math.round((item.uploadFraction ?? 0) * 100)}%
                      </span>
                    </div>
                  ) : null}
                  {item.status === "processing" && item.job && item.job.totalEntries > 0 ? (
                    <div aria-busy="true">
                      <Progress
                        value={Math.round((item.job.processedEntries / item.job.totalEntries) * 100)}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.job.processedEntries} of {item.job.totalEntries} entries checked…
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {items.some((item) => item.job) ? (
              <>
                <Separator />
                <SectionLabel>Results</SectionLabel>
                <CounterGrid>
                  {(() => {
                    const totals = items
                      .filter((item) => item.job)
                      .reduce(
                        (acc, item) => ({
                          imported: acc.imported + (item.job?.imported ?? 0),
                          duplicated: acc.duplicated + (item.job?.duplicated ?? 0),
                          ignored: acc.ignored + (item.job?.ignored ?? 0),
                          videosIgnored: acc.videosIgnored + (item.job?.videosIgnored ?? 0),
                          failed: acc.failed + (item.job?.failed ?? 0),
                        }),
                        { imported: 0, duplicated: 0, ignored: 0, videosIgnored: 0, failed: 0 },
                      );
                    return (
                      <>
                        <div>
                          <strong>{totals.imported}</strong>
                          <span>Photos added</span>
                        </div>
                        <div>
                          <strong>{totals.duplicated}</strong>
                          <span>Already in library</span>
                        </div>
                        <div>
                          <strong>{totals.ignored}</strong>
                          <span>Ignored</span>
                        </div>
                        <div>
                          <strong>{totals.videosIgnored}</strong>
                          <span>Videos skipped</span>
                        </div>
                        <div>
                          <strong>{totals.failed}</strong>
                          <span>Failed</span>
                        </div>
                      </>
                    );
                  })()}
                </CounterGrid>
              </>
            ) : null}

            <Hint>
              Split exports (e.g. Google Takeout part 001…00N) ship media across parts —
              select every part at once. Duplicated files are detected automatically.
              Archives already uploaded keep importing even after stopping the uploads.
            </Hint>
            <div className="flex justify-end">
              <Button variant="outline" onClick={reset} disabled={running}>
                Import more archives
              </Button>
            </div>
          </Card>
        )}
      </PageInner>
    </PageScroll>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      {children}
    </div>
  );
}

function FileRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
