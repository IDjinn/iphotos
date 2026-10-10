"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftIcon,
  ImageOffIcon,
  MergeIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { CloudPhoto } from "@/data/cloud-photos-repository";
import {
  deletePerson,
  listPeople,
  listPersonPhotos,
  mergePeople,
  renamePerson,
} from "@/data/people-repository";
import { useViewerStore } from "@/stores/ui";
import { AuthImage } from "@/components/media/auth-image";
import {
  GridInner,
  GridRow,
  GridScroll,
  SkeletonGrid,
  StatusArea,
  StatusBox,
} from "@/components/gallery/gallery.styles";
import { formatDuration } from "@/lib/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import {
  MergeList,
  MergeOption,
  MergeOptionMeta,
  PersonActions,
  PersonHeader,
  PersonSubtitle,
  PersonTitle,
} from "./person.styles";

const PAGE_SIZE = 60;
/** Measured layout for the virtualized grid (dynamic runtime values). */
interface GridLayout {
  columns: number;
  cell: number;
  gap: number;
}

const DEFAULT_LAYOUT: GridLayout = { columns: 3, cell: 152, gap: 4 };

/**
 * One person (doc 18 §10): photo grid + rename, merge into another person and
 * delete. Photos open in the shared viewer; aggregates come from the people list.
 */
export function PersonScreen({ personId }: { personId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const openViewer = useViewerStore((s) => s.open);

  const peopleQuery = useQuery({ queryKey: ["people"], queryFn: listPeople });
  const person = peopleQuery.data?.find((p) => p.id === personId);
  const others = (peopleQuery.data ?? []).filter((p) => p.id !== personId);

  const photosQuery = useInfiniteQuery({
    queryKey: ["person-photos", personId],
    queryFn: ({ pageParam }) => listPersonPhotos(personId, pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const photos = useMemo(
    () => (photosQuery.data ? photosQuery.data.pages.flatMap((page) => page.items) : []),
    [photosQuery.data],
  );
  const totalCount = photosQuery.data?.pages[0]?.totalCount ?? 0;

  // Same measured virtualized grid as the gallery (responsive columns follow
  // the container and the user's text-size setting).
  const [layout, setLayout] = useState<GridLayout>(DEFAULT_LAYOUT);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const minCell = 9 * rootFontSize;
    const gap = 0.25 * rootFontSize;
    const compute = () => {
      const width = inner.clientWidth;
      if (width <= 0) return;
      const columns = Math.max(2, Math.floor((width + gap) / (minCell + gap)));
      const cell = Math.floor((width - (columns - 1) * gap) / columns);
      setLayout({ columns, cell, gap });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [photosQuery.isLoading]);

  const rowCount = Math.ceil(photos.length / layout.columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => layout.cell + layout.gap,
    overscan: 4,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = photosQuery;
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rowCount - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Rename ──────────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string | null) => renamePerson(personId, name),
    onSuccess: async () => {
      setEditingName(false);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Couldn't rename the person. Try again."),
  });
  const saveName = (value: string) => {
    const trimmed = value.trim();
    const current = person?.name ?? null;
    if (!person || trimmed === (current ?? "")) {
      setEditingName(false);
      return;
    }
    if (trimmed.length > 200) {
      toast.error("Person names are limited to 200 characters.");
      return;
    }
    rename.mutate(trimmed.length > 0 ? trimmed : null);
  };

  // ── Merge ───────────────────────────────────────────────────────────────────
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string | null } | null>(null);
  const merge = useMutation({
    mutationFn: (targetId: string) => mergePeople(personId, targetId),
    onSuccess: async (_data, targetId) => {
      setMergeOpen(false);
      setMergeTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["person-photos"] });
      toast.success("People merged");
      router.push(`/people/${targetId}`);
    },
    onError: () => toast.error("Couldn't merge the people. Try again."),
  });

  // ── Delete ──────────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deletePerson(personId),
    onSuccess: async () => {
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["person-photos"] });
      toast.success("Person deleted — their faces are now unassigned");
      router.push("/people");
    },
    onError: () => toast.error("Couldn't delete the person. Try again."),
  });

  if (peopleQuery.isLoading || photosQuery.isLoading) {
    return (
      <>
        <PersonHeader>
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-7 w-40" />
        </PersonHeader>
        <SkeletonGrid aria-busy="true">
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </SkeletonGrid>
      </>
    );
  }

  if (!person) {
    return (
      <StatusArea>
        <StatusBox role="alert">
          <ImageOffIcon aria-hidden />
          <h2>Person not found</h2>
          <p>They may have been merged or removed.</p>
          <Button variant="outline" onClick={() => router.push("/people")}>
            Back to people
          </Button>
        </StatusBox>
      </StatusArea>
    );
  }

  return (
    <>
      <PersonHeader>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to people"
          onClick={() => router.push("/people")}
        >
          <ArrowLeftIcon aria-hidden />
        </Button>
        <PersonTitle>
          {editingName ? (
            <Input
              autoFocus
              defaultValue={person.name ?? ""}
              placeholder="Person name"
              maxLength={200}
              className="max-w-72"
              aria-label="Person name"
              onBlur={(event) => saveName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName(event.currentTarget.value);
                if (event.key === "Escape") setEditingName(false);
              }}
            />
          ) : (
            <>
              <h1>{person.name ?? "Unnamed"}</h1>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Rename person"
                onClick={() => setEditingName(true)}
              >
                <PencilIcon aria-hidden />
              </Button>
            </>
          )}
        </PersonTitle>
        <PersonSubtitle>
          {totalCount > 0 ? `${totalCount} ${totalCount === 1 ? "photo" : "photos"}` : ""}
        </PersonSubtitle>
        <PersonActions>
          <Button
            variant="outline"
            disabled={others.length === 0}
            onClick={() => setMergeOpen(true)}
          >
            <MergeIcon aria-hidden />
            Merge
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon aria-hidden />
            Delete
          </Button>
        </PersonActions>
      </PersonHeader>

      {photosQuery.isError ? (
        <StatusArea>
          <StatusBox role="alert">
            <ImageOffIcon aria-hidden />
            <h2>Couldn&apos;t load their photos</h2>
            <p>Check your connection and try again.</p>
            <Button
              variant="outline"
              onClick={() => void photosQuery.refetch()}
              disabled={photosQuery.isFetching}
            >
              Try again
            </Button>
          </StatusBox>
        </StatusArea>
      ) : photos.length === 0 ? (
        <StatusArea>
          <StatusBox>
            <h2>No photos yet</h2>
            <p>Photos with this person&apos;s face show up here.</p>
          </StatusBox>
        </StatusArea>
      ) : (
        <GridScroll ref={setScrollEl}>
          <GridInner ref={innerRef} style={{ height: virtualizer.getTotalSize() + layout.gap }}>
            {virtualItems.map((row) => (
              <GridRow key={row.key} style={{ transform: `translateY(${row.start}px)` }}>
                {photos
                  .slice(row.index * layout.columns, (row.index + 1) * layout.columns)
                  .map((photo, cellIndex) => (
                    <PersonCell
                      key={photo.id}
                      photo={photo}
                      size={layout.cell}
                      onOpen={() => openViewer(photos.map((p) => p.id), row.index * layout.columns + cellIndex)}
                    />
                  ))}
              </GridRow>
            ))}
          </GridInner>
        </GridScroll>
      )}

      {photos.length > 0 && photos.length < totalCount && photosQuery.isFetchingNextPage ? (
        <PersonSubtitle style={{ display: "block", padding: "0 1rem 1rem" }} role="status">
          Loading more…
        </PersonSubtitle>
      ) : null}

      {/* Merge: pick the surviving person; the current one folds into it. */}
      <Dialog open={mergeOpen} onOpenChange={(open) => (open ? setMergeOpen(true) : (setMergeOpen(false), setMergeTarget(null)))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge into…</DialogTitle>
            <DialogDescription>
              All of this person&apos;s faces move to the one you pick.
            </DialogDescription>
          </DialogHeader>
          <MergeList>
            {others.map((other) => (
              <MergeOption
                key={other.id}
                onClick={() => setMergeTarget({ id: other.id, name: other.name })}
                aria-label={`Merge into ${other.name ?? "Unnamed"}`}
              >
                <FaceAvatar faceId={other.coverFaceId} size={40} label={other.name ?? "Unnamed"} />
                <MergeOptionMeta>
                  <strong>{other.name ?? "Unnamed"}</strong>
                  <span>
                    {other.faceCount} {other.faceCount === 1 ? "face" : "faces"}
                  </span>
                </MergeOptionMeta>
              </MergeOption>
            ))}
          </MergeList>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={mergeTarget !== null}
        onOpenChange={(open) => (open ? null : setMergeTarget(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Merge into {mergeTarget?.name ?? "Unnamed"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This person&apos;s photos become part of {mergeTarget?.name ?? "that person"} and
              this entry disappears. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merge.isPending} onClick={() => setMergeTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (mergeTarget) merge.mutate(mergeTarget.id);
              }}
            >
              {merge.isPending ? "Merging…" : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {person.name ?? "Unnamed"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The person entry is removed and their faces become unassigned — the photos
              themselves stay in your library. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Viewer cell for the person grid — no selection, tap to open. */
function PersonCell({ photo, size, onOpen }: { photo: CloudPhoto; size: number; onOpen: () => void }) {
  const isVideo = photo.mediaType === "Video";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${photo.fileName}`}
      className="relative block cursor-pointer overflow-hidden rounded-[var(--radius-md)] bg-[var(--muted)]"
      style={{ width: size, height: size }}
    >
      <AuthImage photo={photo} fill />
      {isVideo ? (
        <span
          aria-hidden
          className="absolute bottom-1 left-1 flex items-center gap-1 rounded-[var(--radius-sm)] bg-black/70 px-1.5 py-0.5 text-xs text-white"
        >
          <PlayIcon className="size-3" fill="currentColor" />
          {photo.durationSeconds ? formatDuration(photo.durationSeconds) : null}
        </span>
      ) : null}
    </button>
  );
}
