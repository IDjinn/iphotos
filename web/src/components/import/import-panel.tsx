"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  listZipImports,
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

const newKey = () => crypto.randomUUID();

/** Lifecycle of one archive row. `queued`/`processing` mean the archive is on
 * the server and its import job is tracked independently of the upload pump. */
type FileStatus =
  | "waiting"
  | "uploading"
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

interface BatchItem {
  /** Stable identity: local rows get a random key, server rows reuse the job id. */
  key: string;
  /** Present only for locally-picked archives that haven't been accepted yet. */
  file?: File;
  status: FileStatus;
  /** 0..1 upload progress while `uploading`. */
  uploadFraction?: number;
  job?: ZipImportJob;
  message?: string;
}

const jobToItem = (job: ZipImportJob): BatchItem => ({
  key: job.id,
  status: stateToStatus(job.state),
  job,
});

const stateToStatus = (state: ZipImportJob["state"]): FileStatus =>
  state === "Queued" ? "queued" : state === "Processing" ? "processing" : state === "Done" ? "done" : "failed";

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

export function ImportPanel() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ZipUploadHandle | null>(null);
  const unmountedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const pumpingRef = useRef(false);
  // Keep the upload pump reading fresh state: item status changes made by poll
  // callbacks must be visible to the loop between uploads.
  const itemsRef = useRef(items);
  const restoredRef = useRef(false);

  const updateItems = useCallback(
    (updater: (current: BatchItem[]) => BatchItem[]) => {
      itemsRef.current = updater(itemsRef.current);
      setItems(itemsRef.current);
    },
    [],
  );

  /** Follows one import job to its terminal state, patching its row. */
  const trackJob = useCallback(
    (key: string, jobId: string): Promise<void> =>
      pollZipImport(
        jobId,
        (update) =>
          updateItems((current) =>
            current.map((item) =>
              item.key === key ? { ...item, job: update, status: stateToStatus(update.state) } : item,
            ),
          ),
        { intervalMs: 2_000, shouldStop: () => unmountedRef.current },
      )
        .then(async (finished) => {
          if (finished.state === "Done") {
            updateItems((current) =>
              current.map((item) => (item.key === key ? { ...item, status: "done", job: finished } : item)),
            );
            // The library changed server-side (imports and even failures can
            // add photos); refresh the gallery/usage caches this panel doesn't own.
            await queryClient.invalidateQueries({ queryKey: ["photos"] });
            await queryClient.invalidateQueries({ queryKey: ["usage"] });
            toast(
              `Import finished — ${finished.imported} ${finished.imported === 1 ? "item" : "items"} added`,
            );
          } else {
            updateItems((current) =>
              current.map((item) =>
                item.key === key
                  ? { ...item, status: "failed", job: finished, message: finished.error || "The import didn't finish." }
                  : item,
              ),
            );
          }
        })
        .catch((caught: unknown) => {
          if (unmountedRef.current) return;
          updateItems((current) =>
            current.map((item) =>
              item.key === key
                ? {
                    ...item,
                    status: "failed",
                    message:
                      caught instanceof ApiError && caught.message
                        ? caught.message
                        : "Lost track of this import — check the library later.",
                  }
                : item,
            ),
          );
        }),
    [updateItems, queryClient],
  );

  // The import queue lives server-side, so a reload never loses it: seed the
  // view from recent jobs and resume polling the ones still in flight.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    listZipImports()
      .then((jobs) => {
        if (cancelled) return;
        updateItems((current) => {
          const known = new Set(current.map((item) => item.key));
          const fresh = jobs.filter((job) => !known.has(job.id)).map(jobToItem);
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
        for (const job of jobs) {
          if (job.state === "Queued" || job.state === "Processing") {
            void trackJob(job.id, job.id);
          }
        }
      })
      .catch(() => {
        // History is a nice-to-have; upload failures surface on their own rows.
      });
    return () => {
      cancelled = true;
    };
  }, [updateItems, trackJob]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

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
      updateItems((current) => [
        ...current,
        ...accepted.map((file) => ({ key: newKey(), file, status: "waiting" as const })),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick reads state-free helpers only
  }, []);

  // Serial upload pump: one archive at a time (full connection each), never
  // waiting for processing — the server queues accepted archives and the
  // worker imports them in its own time. Archives picked mid-run join the queue.
  const start = async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    stopRequestedRef.current = false;
    setBusy(true);
    try {
      for (;;) {
        if (stopRequestedRef.current || unmountedRef.current) break;
        const next = itemsRef.current.find((item) => item.status === "waiting" && item.file);
        if (!next) break;
        const file = next.file!;
        updateItems((current) =>
          current.map((item) =>
            item.key === next.key ? { ...item, status: "uploading", uploadFraction: 0, message: undefined } : item,
          ),
        );
        const handle = createZipImportUpload(file, (p) =>
          updateItems((current) =>
            current.map((item) => (item.key === next.key ? { ...item, uploadFraction: p.fraction } : item)),
          ),
        );
        handleRef.current = handle;
        try {
          const jobId = await handle.jobIdPromise;
          updateItems((current) =>
            current.map((item) => (item.key === next.key ? { ...item, status: "queued" } : item)),
          );
          void trackJob(next.key, jobId);
        } catch (caught) {
          if (isCancel(caught)) {
            updateItems((current) =>
              current.map((item) =>
                item.key === next.key ? { ...item, status: "canceled", message: "Upload canceled." } : item,
              ),
            );
            break;
          }
          // One bad upload doesn't stop the rest of the batch — Takeout parts
          // are independent of each other.
          updateItems((current) =>
            current.map((item) =>
              item.key === next.key
                ? {
                    ...item,
                    status: "failed",
                    message:
                      caught instanceof ApiError && caught.message
                        ? caught.message
                        : "The upload failed. Try again.",
                  }
                : item,
            ),
          );
        } finally {
          handleRef.current = null;
        }
      }
    } finally {
      pumpingRef.current = false;
      setBusy(false);
    }
  };

  // Stops the upload pump: the current upload aborts and pending archives are
  // skipped, but archives already on the server keep importing.
  const stop = () => {
    stopRequestedRef.current = true;
    handleRef.current?.cancel();
    updateItems((current) =>
      current.map((item) =>
        item.status === "waiting"
          ? { ...item, status: "canceled" as const, message: "Upload canceled." }
          : item,
      ),
    );
  };

  const removeItem = (key: string) => {
    updateItems((current) => current.filter((item) => item.key !== key));
  };

  const waitingItems = items.filter((item) => item.status === "waiting");
  const trackedItems = items.filter((item) => item.status !== "waiting");
  const rowName = (item: BatchItem) => item.file?.name ?? item.job?.fileName ?? "Archive";
  const rowSize = (item: BatchItem) => item.file?.size ?? item.job?.sizeBytes ?? 0;

  return (
    <PageScroll>
      <PageInner>
        <PageTitle>Import archives</PageTitle>

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
                Photo and video archives like Google Takeout (all parts at once) are supported.
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

          {waitingItems.length > 0 ? (
            <div className="flex flex-col gap-2">
              {waitingItems.map((item) => (
                <FileRow key={item.key}>
                  <ArchiveIcon aria-hidden className="size-5 text-muted-foreground" />
                  <div className="meta">
                    <strong>{rowName(item)}</strong>
                    <span>{formatBytes(rowSize(item))}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${rowName(item)}`}
                    onClick={() => removeItem(item.key)}
                  >
                    <Trash2Icon aria-hidden className="size-4" />
                  </Button>
                </FileRow>
              ))}
            </div>
          ) : null}

          {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}

          {!busy && waitingItems.length > 0 ? (
            <div className="flex justify-end">
              <Button onClick={() => void start()}>
                <UploadIcon aria-hidden className="size-4" />
                Import {waitingItems.length === 1 ? "archive" : `${waitingItems.length} archives`}
              </Button>
            </div>
          ) : null}
        </Card>

        {trackedItems.length > 0 ? (
          <Card className="gap-4 p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Imports</SectionLabel>
              {busy ? (
                <Button variant="ghost" size="sm" onClick={stop}>
                  Stop uploads
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              {trackedItems.map((item) => (
                <div key={item.key} className="flex flex-col gap-1.5">
                  <JobHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusIcon status={item.status} />
                      <div className="meta min-w-0">
                        <strong className="truncate">{rowName(item)}</strong>
                        <span>{formatBytes(rowSize(item))}</span>
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

            {(() => {
              const tracked = trackedItems.filter((item) => item.job);
              if (tracked.length === 0) return null;
              const totals = tracked.reduce(
                (acc, item) => ({
                  imported: acc.imported + (item.job?.imported ?? 0),
                  videosImported: acc.videosImported + (item.job?.videosImported ?? 0),
                  duplicated: acc.duplicated + (item.job?.duplicated ?? 0),
                  ignored: acc.ignored + (item.job?.ignored ?? 0),
                  videosIgnored: acc.videosIgnored + (item.job?.videosIgnored ?? 0),
                  failed: acc.failed + (item.job?.failed ?? 0),
                }),
                { imported: 0, videosImported: 0, duplicated: 0, ignored: 0, videosIgnored: 0, failed: 0 },
              );
              return (
                <>
                  <Separator />
                  <SectionLabel>Results</SectionLabel>
                  <CounterGrid>
                    <div>
                      <strong>{totals.imported}</strong>
                      <span>Items added</span>
                    </div>
                    <div>
                      <strong>{totals.videosImported}</strong>
                      <span>Videos added</span>
                    </div>
                    <div>
                      <strong>{totals.duplicated}</strong>
                      <span>Already in library</span>
                    </div>
                    <div>
                      <strong>{totals.ignored}</strong>
                      <span>Ignored</span>
                    </div>
                    {totals.videosIgnored > 0 ? (
                      <div>
                        <strong>{totals.videosIgnored}</strong>
                        <span>Videos skipped</span>
                      </div>
                    ) : null}
                    <div>
                      <strong>{totals.failed}</strong>
                      <span>Failed</span>
                    </div>
                  </CounterGrid>
                </>
              );
            })()}

            <Hint>
              Split exports (e.g. Google Takeout part 001…00N) ship media across parts —
              select every part at once. Duplicated files are detected automatically.
              Archives already uploaded keep importing even after stopping the uploads.
            </Hint>
          </Card>
        ) : null}
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
