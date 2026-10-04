"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  CircleAlertIcon,
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
  type UploadProgress,
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

export function ImportPanel() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [job, setJob] = useState<ZipImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<ZipUploadHandle | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const pick = (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    if (!looksLikeZip(picked)) {
      setValidation("That file isn't a zip archive. Choose a .zip file.");
      return;
    }
    setValidation(null);
    setFile(picked);
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
    if (!file) return;
    setBusy(true);
    setError(null);
    setJob(null);
    setProgress(null);
    const handle = createZipImportUpload(file, setProgress);
    handleRef.current = handle;
    try {
      const jobId = await handle.jobIdPromise;
      const finished = await pollZipImport(
        jobId,
        (update) => setJob(update),
        { intervalMs: 2_000, shouldStop: () => unmountedRef.current },
      );
      // The library changed server-side (imports and even failures can add photos);
      // refresh the gallery/usage caches that this panel doesn't own.
      await queryClient.invalidateQueries({ queryKey: ["photos"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
      if (finished.state === "Done") {
        toast(`Import finished — ${finished.imported} ${finished.imported === 1 ? "photo" : "photos"} added`);
      }
    } catch (caught) {
      if (isCancel(caught)) {
        setError("Import canceled.");
      } else if (caught instanceof ApiError && caught.status === 0) {
        // Status 0 covers network failures and the staging watchdog — prefer the
        // specific cause when the ApiError carries one.
        setError(caught.message || "Upload failed — check your connection and try again.");
      } else if (caught instanceof ApiError) {
        setError(caught.message || "The import couldn't be started. Try again.");
      } else {
        setError("The import couldn't be started. Try again.");
      }
    } finally {
      setBusy(false);
      handleRef.current = null;
    }
  };

  const reset = () => {
    setFile(null);
    setProgress(null);
    setJob(null);
    setError(null);
    setValidation(null);
  };

  const uploading = busy && !job;
  const running = Boolean(job && (job.state === "Queued" || job.state === "Processing"));

  return (
    <PageScroll>
      <PageInner>
        <PageTitle>Import archive</PageTitle>

        {!job ? (
          <Card className="gap-4 p-6">
            {!file && !uploading ? (
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
                    Drop a .zip archive here, paste it (Ctrl+V), or browse.
                    <br />
                    Photo archives like Google Takeout are supported.
                  </p>
                  <Button variant="outline" onClick={() => inputRef.current?.click()}>
                    Browse files
                  </Button>
                </EmptyState>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  hidden
                  onChange={(event) => {
                    pick(event.target.files);
                    event.target.value = "";
                  }}
                />
              </DropZone>
            ) : null}

            {file && !uploading ? (
              <FileRow>
                <ArchiveIcon aria-hidden className="size-5 text-muted-foreground" />
                <div className="meta">
                  <strong>{file.name}</strong>
                  <span>{formatBytes(file.size)}</span>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove file" onClick={reset}>
                  <Trash2Icon aria-hidden className="size-4" />
                </Button>
                <Button onClick={() => void start()} disabled={busy}>
                  <UploadIcon aria-hidden className="size-4" />
                  Import
                </Button>
              </FileRow>
            ) : null}

            {uploading ? (
              <UploadBox aria-busy="true">
                <div className="row">
                  <Loader2Icon aria-hidden className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm">
                    {progress && progress.fraction >= 1
                      ? "Storing archive on server…"
                      : `Uploading ${file?.name}… ${progress ? `${Math.round(progress.fraction * 100)}%` : ""}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleRef.current?.cancel();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <Progress value={Math.round((progress?.fraction ?? 0) * 100)} />
              </UploadBox>
            ) : null}

            {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </Card>
        ) : (
          <Card className="gap-4 p-6">
            <JobHeader>
              <div className="meta">
                <strong>{job.fileName}</strong>
                <span>{formatBytes(job.sizeBytes)}</span>
              </div>
              <Badge
                variant={job.state === "Done" ? "secondary" : job.state === "Failed" ? "destructive" : "default"}
              >
                {job.state === "Done"
                  ? "Finished"
                  : job.state === "Failed"
                    ? "Failed"
                    : "Importing…"}
              </Badge>
            </JobHeader>
            {running ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <Progress
                  value={job.totalEntries > 0 ? Math.round((job.processedEntries / job.totalEntries) * 100) : 0}
                />
                <p className="text-sm text-muted-foreground">
                  {job.processedEntries} of {job.totalEntries} entries checked…
                </p>
              </div>
            ) : null}
            {job.state === "Failed" ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                {job.error || "The import didn't finish. Check the archive and try again."}
              </p>
            ) : null}
            <Separator />
            <SectionLabel>Results</SectionLabel>
            <CounterGrid>
              <div>
                <strong>{job.imported}</strong>
                <span>Photos added</span>
              </div>
              <div>
                <strong>{job.duplicated}</strong>
                <span>Already in library</span>
              </div>
              <div>
                <strong>{job.ignored}</strong>
                <span>Ignored</span>
              </div>
              <div>
                <strong>{job.videosIgnored}</strong>
                <span>Videos skipped</span>
              </div>
              <div>
                <strong>{job.failed}</strong>
                <span>Failed</span>
              </div>
            </CounterGrid>
            <Hint>
              Split exports (e.g. Google Takeout part 001…00N) ship media across parts —
              import every part. Duplicated files are detected automatically.
            </Hint>
            <div className="flex justify-end">
              <Button variant="outline" onClick={reset} disabled={running}>
                Import another archive
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

function UploadBox({ children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className="flex flex-col gap-2" {...rest}>
      {children}
    </div>
  );
}
