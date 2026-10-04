"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CalendarIcon,
  CloudUploadIcon,
  ImageOffIcon,
  ListFilterIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { deletePhoto, listPhotos } from "@/data/cloud-photos-repository";
import { useViewerStore, useUploadDialogStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { PhotoCell } from "./photo-cell";
import {
  CellBadge,
  CountLabel,
  GalleryHeader,
  GridInner,
  GridRow,
  GridScroll,
  SelectionBar,
  SkeletonGrid,
  StatusArea,
  StatusBox,
} from "./gallery.styles";

const PAGE_SIZE = 60;
/** Measured layout for the virtualized grid (dynamic runtime values). */
interface GridLayout {
  columns: number;
  cell: number;
  gap: number;
}

const DEFAULT_LAYOUT: GridLayout = { columns: 3, cell: 152, gap: 4 };

export function GalleryScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const openViewer = useViewerStore((s) => s.open);
  const showUpload = useUploadDialogStore((s) => s.show);

  // Filters live in the URL (shareable, back-button coherent).
  const q = searchParams.get("q") ?? "";
  const camera = searchParams.get("camera") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const deferred = useDeferredValue({ q, camera, from, to });
  const hasFilters = Boolean(q || camera || from || to);

  const photosQuery = useInfiniteQuery({
    queryKey: ["photos", deferred],
    queryFn: ({ pageParam }) =>
      listPhotos({
        page: pageParam,
        pageSize: PAGE_SIZE,
        fileName: deferred.q || undefined,
        camera: deferred.camera || undefined,
        from: deferred.from ? `${deferred.from}T00:00:00Z` : undefined,
        to: deferred.to ? `${deferred.to}T23:59:59Z` : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const photos = useMemo(
    () => (photosQuery.data ? photosQuery.data.pages.flatMap((page) => page.items) : []),
    [photosQuery.data],
  );
  const totalCount = photosQuery.data?.pages[0]?.totalCount ?? 0;

  const [layout, setLayout] = useState<GridLayout>(DEFAULT_LAYOUT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Measure the grid box: responsive columns follow the container and the
  // user's text-size setting (min cell is defined in rem).
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const rootFontSize =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
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
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.cell + layout.gap,
    overscan: 4,
  });

  // Infinite scroll: load the next page as the end of the list nears.
  const virtualItems = virtualizer.getVirtualItems();
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = photosQuery;
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rowCount - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleSelect = useCallback((photoId: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const deleteSelected = async () => {
    setDeleting(true);
    const ids = [...selection];
    const results = await Promise.allSettled(ids.map((id) => deletePhoto(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelection(new Set());
    setConfirmDelete(false);
    setDeleting(false);
    await queryClient.invalidateQueries({ queryKey: ["photos"] });
    await queryClient.invalidateQueries({ queryKey: ["usage"] });
    if (failed === 0) toast(`Deleted ${ids.length} ${ids.length === 1 ? "photo" : "photos"}`);
    else if (failed === ids.length) toast.error("Couldn't delete the selected photos. Try again.");
    else toast(`Deleted ${ids.length - failed}; ${failed} couldn't be deleted.`);
  };

  const clearFilters = () => router.push("/photos");
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(params.size ? `/photos?${params.toString()}` : "/photos");
  };

  if (photosQuery.isError) {
    return (
      <>
        <GalleryHeader>
          <h1>Photos</h1>
        </GalleryHeader>
        <StatusArea>
          <StatusBox role="alert">
            <ImageOffIcon aria-hidden />
            <h2>Couldn&apos;t load your photos</h2>
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
      </>
    );
  }

  if (photosQuery.isLoading) {
    return (
      <>
        <GalleryHeader>
          <h1>Photos</h1>
        </GalleryHeader>
        <SkeletonGrid aria-busy="true">
          {Array.from({ length: 32 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </SkeletonGrid>
      </>
    );
  }

  return (
    <>
      <GalleryHeader>
        <h1>Photos</h1>
        <CountLabel>
          {photos.length === 0
            ? ""
            : `${photos.length}${photos.length < totalCount ? ` of ${totalCount}` : ""}`}
        </CountLabel>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" aria-label="Filter photos">
              <ListFilterIcon aria-hidden />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-camera">Camera</Label>
                <Input
                  id="filter-camera"
                  defaultValue={camera}
                  placeholder="e.g. Pixel"
                  onBlur={(event) => setFilter("camera", event.target.value.trim())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setFilter("camera", event.currentTarget.value.trim());
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-from">From</Label>
                  <Input
                    id="filter-from"
                    type="date"
                    value={from}
                    onChange={(event) => setFilter("from", event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-to">To</Label>
                  <Input
                    id="filter-to"
                    type="date"
                    value={to}
                    onChange={(event) => setFilter("to", event.target.value)}
                  />
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarIcon aria-hidden className="size-3.5" />
                Dates match when each photo was taken.
              </p>
              {hasFilters ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </GalleryHeader>

      {photos.length === 0 ? (
        <StatusArea>
          <StatusBox>
            <CloudUploadIcon aria-hidden />
            {hasFilters ? (
              <>
                <h2>No photos match your search</h2>
                <p>Try different filters, or clear them to see everything.</p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <h2>No photos yet</h2>
                <p>Upload your first photos to see them here.</p>
                <Button onClick={showUpload}>Upload photos</Button>
              </>
            )}
          </StatusBox>
        </StatusArea>
      ) : (
        <GridScroll ref={scrollRef}>
          <GridInner
            ref={innerRef}
            style={{ height: virtualizer.getTotalSize() + layout.gap }}
          >
            {virtualItems.map((row) => (
              <GridRow key={row.key} style={{ transform: `translateY(${row.start}px)` }}>
                {photos
                  .slice(row.index * layout.columns, (row.index + 1) * layout.columns)
                  .map((photo, cellIndex) => {
                    const index = row.index * layout.columns + cellIndex;
                    return (
                      <PhotoCell
                        key={photo.id}
                        photo={photo}
                        size={layout.cell}
                        selected={selection.has(photo.id)}
                        onOpen={() => openViewer(photos.map((p) => p.id), index)}
                        onToggleSelect={() => toggleSelect(photo.id)}
                      />
                    );
                  })}
              </GridRow>
            ))}
          </GridInner>
        </GridScroll>
      )}

      {photos.length > 0 && photos.length < totalCount && photosQuery.isFetchingNextPage ? (
        <CellBadge role="status" style={{ position: "static", margin: "0 1rem 1rem" }}>
          Loading more…
        </CellBadge>
      ) : null}

      {selection.size > 0 ? (
        <SelectionBar role="toolbar" aria-label="Selected photos actions">
          <span>
            {selection.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Clear selection"
            onClick={() => setSelection(new Set())}
          >
            <XIcon aria-hidden />
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete selected photos"
          >
            <Trash2Icon aria-hidden />
            Delete
          </Button>
        </SelectionBar>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selection.size === 1 ? "1 photo" : `${selection.size} photos`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes them from your library. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteSelected();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
