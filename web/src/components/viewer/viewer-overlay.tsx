"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  deletePhoto,
  fetchFileBlob,
  getPhoto,
} from "@/data/cloud-photos-repository";
import { useAuthFileUrl } from "@/data/blob-cache";
import { useViewerStore } from "@/stores/ui";
import { formatDate, formatBytes, formatDuration } from "@/lib/format";
import { LivePhotoStage } from "./LivePhotoStage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Caption,
  Content,
  DestructiveIconButton,
  IconButton,
  Overlay,
  Photo,
  Stage,
  StageButton,
  StageSkeleton,
  TopRow,
  Video,
} from "./viewer.styles";

/**
 * Fullscreen photo viewer (Radix dialog). Two exits everywhere: the X button
 * or Escape/browser back; arrows navigate, all keyboard-operable.
 */
export function ViewerOverlay() {
  const queryClient = useQueryClient();
  const photoIds = useViewerStore((s) => s.photoIds);
  const index = useViewerStore((s) => s.index);
  const close = useViewerStore((s) => s.close);
  const next = useViewerStore((s) => s.next);
  const previous = useViewerStore((s) => s.previous);
  const removeCurrent = useViewerStore((s) => s.removeCurrent);

  const open = photoIds.length > 0;
  const photoId = open ? (photoIds[index] ?? null) : null;

  const suppressPop = useRef(false);

  // Browser back closes the viewer: opening pushes a history entry, popping
  // it closes the overlay — state stays coherent in both directions.
  useEffect(() => {
    if (!open) return;
    if (!window.history.state?.viewer) {
      window.history.pushState({ viewer: true }, "");
    }
    const onPopState = () => {
      suppressPop.current = false;
      close();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Closed without consuming the entry (e.g. last photo deleted): pop it.
      if (window.history.state?.viewer) window.history.back();
    };
  }, [open, close]);

  const handleClose = useCallback(() => {
    if (window.history.state?.viewer) {
      if (suppressPop.current) return;
      suppressPop.current = true;
      window.history.back();
    } else {
      close();
    }
  }, [close]);

  const photoQuery = useQuery({
    queryKey: ["photo", photoId],
    queryFn: () => getPhoto(photoId as string),
    enabled: photoId !== null,
  });

  const photo = photoQuery.data;

  const previewQuery = useAuthFileUrl(photoId ?? "", "preview");

  // Videos play the original bytes (Range-friendly); the preview (poster frame)
  // doubles as the <video> poster while the file loads.
  const isVideo = photo?.mediaType === "Video";
  const videoQuery = useAuthFileUrl(photoId ?? "", "original", Boolean(photoId) && isVideo);

  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    if (!photoQuery.data) return;
    setDownloading(true);
    try {
      const blob = await fetchFileBlob(photoQuery.data.id, "original");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = photoQuery.data.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast("Download started");
    } catch {
      toast.error("Couldn't download the photo. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!photoQuery.data) return;
    setDeleting(true);
    try {
      await deletePhoto(photoQuery.data.id);
      removeCurrent();
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ["photos"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
      toast("Photo deleted");
    } catch {
      toast.error("Couldn't delete the photo. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <Overlay />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild>
          <Content
            aria-label={photo?.fileName ?? "Photo viewer"}
            onKeyDown={(event: React.KeyboardEvent) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                next();
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                previous();
              }
            }}
          >
            <DialogPrimitive.Title asChild>
              <div role="status" className="sr-only">
                {photo?.title || photo?.fileName || "Photo"}
              </div>
            </DialogPrimitive.Title>
            <TopRow>
              <Caption>
                <strong>{photo?.title || photo?.fileName || "Loading…"}</strong>
                {photo ? (
                  <span>
                    {formatDate(photo.takenAt ?? photo.createdAt)}
                    {photo.width && photo.height
                      ? ` · ${photo.width} × ${photo.height}`
                      : ""}
                    {photo.mediaType === "Video" && photo.durationSeconds
                      ? ` · ${formatDuration(photo.durationSeconds)}`
                      : ""}{" "}
                    · {formatBytes(photo.sizeBytes)}
                  </span>
                ) : null}
                {photo?.description ? <span>{photo.description}</span> : null}
              </Caption>
              <IconButton
                onClick={() => void download()}
                disabled={!photo || downloading}
                aria-label="Download original"
              >
                {downloading ? (
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                ) : (
                  <DownloadIcon aria-hidden className="size-4" />
                )}
              </IconButton>
              <DestructiveIconButton
                onClick={() => setConfirmDelete(true)}
                disabled={!photo}
                aria-label="Delete photo"
              >
                <Trash2Icon aria-hidden className="size-4" />
              </DestructiveIconButton>
              <IconButton onClick={handleClose} aria-label="Close viewer">
                <XIcon aria-hidden className="size-5" />
              </IconButton>
            </TopRow>
            <Stage>
              {photoId && !isVideo && previewQuery.isPending ? <StageSkeleton /> : null}
              {photoId && !isVideo && previewQuery.data ? (
                photo?.isLive ? (
                  <LivePhotoStage key={photoId} photo={photo} previewUrl={previewQuery.data} />
                ) : (
                  <Photo key={photoId} src={previewQuery.data} alt={photo?.fileName ?? ""} />
                )
              ) : null}
              {photoId && isVideo && videoQuery.data ? (
                <Video
                  key={photoId}
                  src={videoQuery.data}
                  poster={previewQuery.data}
                  controls
                  autoPlay
                  playsInline
                />
              ) : null}
              {photoId && (isVideo ? videoQuery.isError : previewQuery.isError) ? (
                <p role="alert" className="text-sm text-white/80">
                  Couldn&apos;t load this {isVideo ? "video" : "photo"}. Try again.
                </p>
              ) : null}
              {photoIds.length > 1 ? (
                <>
                  <StageButton
                    $side="left"
                    onClick={previous}
                    disabled={index === 0}
                    aria-label="Previous photo"
                  >
                    <ChevronLeftIcon aria-hidden className="size-5" />
                  </StageButton>
                  <StageButton
                    $side="right"
                    onClick={next}
                    disabled={index >= photoIds.length - 1}
                    aria-label="Next photo"
                  >
                    <ChevronRightIcon aria-hidden className="size-5" />
                  </StageButton>
                </>
              ) : null}
            </Stage>
          </Content>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes it from your library. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogPrimitive.Root>
  );
}
