"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftIcon,
  CircleHelpIcon,
  ImageOffIcon,
  ImagesIcon,
  MergeIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { CloudPhoto } from "@/data/cloud-photos-repository";
import {
  acceptMergeSuggestion,
  deletePerson,
  getPerson,
  listPeople,
  listPersonPhotos,
  listPersonSuggestions,
  mergePeople,
  renamePerson,
  submitFaceReview,
  type MergeSuggestion,
  type PersonMergeGroup,
} from "@/data/people-repository";
import { useViewerStore } from "@/stores/ui";
import { AuthImage } from "@/components/media/auth-image";
import {
  CellWrap,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import { ReviewMore } from "./people.styles";
import {
  ConfidenceBar,
  ConfidenceFill,
  ConfidenceTrack,
  MergeList,
  MergeOption,
  MergeOptionMeta,
  PersonActions,
  PersonHeader,
  PersonSubtitle,
  PersonTitle,
  ReviewBanner,
  ReviewBannerActions,
  ReviewBannerFaces,
  ReviewBannerInfo,
  ReviewProgress,
  ReviewProgressFill,
  ReviewStep,
  ReviewStepFigure,
} from "./person.styles";
import { useSuggestionDismissals } from "./use-suggestion-dismissals";

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

  // Group coherence for the header bar: mean member-to-centroid similarity.
  const detailQuery = useQuery({
    queryKey: ["person-detail", personId],
    queryFn: () => getPerson(personId),
  });
  const confidence = detailQuery.data?.confidence ?? null;

  // ── Pending "same person?" review (doc 18 §7.4) — lives on this page so the
  // people hub stays a uniform grid. Faces may join this person; whole duplicate
  // groups may fold into it (or this person into another).
  const { dismissed, dismiss } = useSuggestionDismissals();
  const suggestionsQuery = useQuery({
    queryKey: ["people-suggestions"],
    queryFn: listPersonSuggestions,
  });
  /** The review action in flight — only its button disables. */
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  /** One-by-one review dialog, opened from a banner ("faces" = unassigned
   * candidates, "group" = duplicate people). */
  const [reviewFor, setReviewFor] = useState<"faces" | "group" | null>(null);
  /** Stepper position and the verdicts so far — applied when the review ends. */
  const [stepIndex, setStepIndex] = useState(0);
  const [acceptedIds, setAcceptedIds] = useState<string[]>([]);
  const [rejectedFaceIds, setRejectedFaceIds] = useState<string[]>([]);
  const [unsureFaceIds, setUnsureFaceIds] = useState<string[]>([]);

  // `?? []` keeps stale cached payloads (or a mid-deploy API) from crashing —
  // old responses predate personMergeGroups.
  const pendingFaceMerge = useMemo(
    () =>
      (suggestionsQuery.data?.merges ?? []).find(
        (m) => m.personId === personId && !dismissed.includes(m.id),
      ) ?? null,
    [suggestionsQuery.data, personId, dismissed],
  );
  const pendingGroup = useMemo(() => {
    const group = (suggestionsQuery.data?.personMergeGroups ?? []).find(
      (g) =>
        !dismissed.includes(g.id) &&
        (g.target.personId === personId ||
          g.members.some((m) => m.personId === personId)),
    );
    return group ?? null;
  }, [suggestionsQuery.data, personId, dismissed]);

  const invalidateReview = async () => {
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
    await queryClient.invalidateQueries({ queryKey: ["person-photos"] });
    await queryClient.invalidateQueries({ queryKey: ["person-detail"] });
  };

  const addFaces = useMutation({
    mutationFn: (suggestion: MergeSuggestion) =>
      acceptMergeSuggestion(personId, suggestion.faceIds),
    onMutate: (suggestion) => setBusyReviewId(suggestion.id),
    onSuccess: async (_data, suggestion) => {
      setBusyReviewId(null);
      setReviewFor(null);
      await invalidateReview();
      toast.success(`Added ${suggestion.faceCount} ${suggestion.faceCount === 1 ? "face" : "faces"}`);
    },
    onError: () => {
      setBusyReviewId(null);
      toast.error("Couldn't add the faces. Try again.");
    },
  });

  /** Merges exactly the reviewed subset into the target — the stepper's verdict
   * and the banner's "Merge all" both land here. */
  const mergeReviewed = useMutation({
    mutationFn: async (vars: { personIds: string[]; targetId: string; suggestionId: string }) => {
      for (const id of vars.personIds) {
        await mergePeople(id, vars.targetId);
      }
      return vars;
    },
    onMutate: (vars) => setBusyReviewId(vars.suggestionId),
    onSuccess: async (_data, vars) => {
      setBusyReviewId(null);
      setReviewFor(null);
      // If this page's person folded into the target, follow it.
      if (vars.personIds.includes(personId) && personId !== vars.targetId) {
        router.push(`/people/${vars.targetId}`);
      }
      await invalidateReview();
      toast.success(
        `Merged ${vars.personIds.length} ${vars.personIds.length === 1 ? "person" : "people"}`,
      );
    },
    onError: () => {
      setBusyReviewId(null);
      toast.error("Couldn't merge the people. Try again.");
    },
  });

  const addReviewedFaces = useMutation({
    mutationFn: (vars: {
      acceptedFaceIds: string[];
      rejectedFaceIds: string[];
      unsureFaceIds: string[];
      suggestionId: string;
    }) => submitFaceReview(personId, {
        acceptedFaceIds: vars.acceptedFaceIds,
        rejectedFaceIds: vars.rejectedFaceIds,
        unsureFaceIds: vars.unsureFaceIds,
      }),
    onMutate: (vars) => setBusyReviewId(vars.suggestionId),
    onSuccess: async (_data, vars) => {
      setBusyReviewId(null);
      setReviewFor(null);
      dismiss(vars.suggestionId);
      await invalidateReview();
      toast.success(
        vars.acceptedFaceIds.length > 0
          ? `Added ${vars.acceptedFaceIds.length} ${
              vars.acceptedFaceIds.length === 1 ? "face" : "faces"
            }`
          : "Review saved",
      );
    },
    onError: () => {
      setBusyReviewId(null);
      toast.error("Couldn't save the review. Try again.");
    },
  });

  // ── One-by-one stepper ──────────────────────────────────────────────────────
  const reviewItems =
    reviewFor === "faces"
      ? (pendingFaceMerge?.faceIds ?? [])
      : (pendingGroup?.members.map((m) => m.personId) ?? []);
  const stepMember = reviewFor === "group" ? pendingGroup?.members[stepIndex] : undefined;

  const openReview = (kind: "faces" | "group") => {
    setAcceptedIds([]);
    setRejectedFaceIds([]);
    setUnsureFaceIds([]);
    setStepIndex(0);
    setReviewFor(kind);
  };

  const finishReview = () => {
    if (reviewFor === "faces") {
      if (pendingFaceMerge) {
        addReviewedFaces.mutate({
          acceptedFaceIds: acceptedIds,
          rejectedFaceIds: rejectedFaceIds,
          unsureFaceIds: unsureFaceIds,
          suggestionId: pendingFaceMerge.id,
        });
      }
    } else if (pendingGroup) {
      if (acceptedIds.length > 0) {
        mergeReviewed.mutate({
          personIds: acceptedIds,
          targetId: pendingGroup.target.personId,
          suggestionId: pendingGroup.id,
        });
      } else {
        dismiss(pendingGroup.id);
        setReviewFor(null);
      }
    }
  };

  /** Advances the stepper; on the last step applies the verdicts. */
  const advance = (verdict?: "accept" | "reject" | "defer") => {
    if (verdict === "accept") {
      setAcceptedIds((prev) => [...prev, reviewItems[stepIndex]]);
    } else if (verdict === "reject") {
      setRejectedFaceIds((prev) => [...prev, reviewItems[stepIndex]]);
    } else if (verdict === "defer") {
      setUnsureFaceIds((prev) => [...prev, reviewItems[stepIndex]]);
    }

    if (stepIndex + 1 < reviewItems.length) {
      setStepIndex(stepIndex + 1);
    } else {
      finishReview();
    }
  };

  const skipStep = () => {
    if (stepIndex + 1 < reviewItems.length) {
      setStepIndex(stepIndex + 1);
    } else {
      finishReview();
    }
  };

  const mergeIntoTarget = useMutation({
    mutationFn: (group: PersonMergeGroup) => mergePeople(personId, group.target.personId),
    onMutate: (group) => setBusyReviewId(group.id),
    onSuccess: async (_data, group) => {
      setBusyReviewId(null);
      // Leave the dead page before refetching — see the merge dialog above.
      router.push(`/people/${group.target.personId}`);
      await invalidateReview();
      toast.success(`Merged into ${group.target.name ?? "Unnamed"}`);
    },
    onError: () => {
      setBusyReviewId(null);
      toast.error("Couldn't merge the people. Try again.");
    },
  });

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
      // Leave the dead page before refetching — the merged-away person is gone
      // from the list, so waiting would land on "Person not found".
      router.push(`/people/${targetId}`);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["person-photos"] });
      await queryClient.invalidateQueries({ queryKey: ["person-detail"] });
      toast.success("People merged");
    },
    onError: () => toast.error("Couldn't merge the people. Try again."),
  });

  // ── Delete ──────────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deletePerson(personId),
    onSuccess: async () => {
      setDeleteOpen(false);
      // Same as merge: leave before the list refetch drops this person.
      router.push("/people");
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      toast.success("Person deleted — their faces are now unassigned");
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

      {pendingFaceMerge ? (
        <ReviewBanner aria-label="Faces that may belong to this person">
          <ReviewBannerFaces>
            <FaceAvatar
              faceId={pendingFaceMerge.coverFaceId}
              size={40}
              label="Suggested face"
            />
            {pendingFaceMerge.faceCount > 1 ? (
              <ReviewMore>+{pendingFaceMerge.faceCount - 1}</ReviewMore>
            ) : null}
          </ReviewBannerFaces>
          <ReviewBannerInfo>
            <strong>
              {pendingFaceMerge.faceCount} new{" "}
              {pendingFaceMerge.faceCount === 1 ? "face looks" : "faces look"} like this
              person
            </strong>
            <span>{Math.round(pendingFaceMerge.similarity * 100)}% match</span>
          </ReviewBannerInfo>
          <ReviewBannerActions>
            <Button
              size="sm"
              variant="outline"
              disabled={busyReviewId !== null}
              onClick={() => openReview("faces")}
            >
              <ImagesIcon aria-hidden />
              Review faces
            </Button>
            <Button
              size="sm"
              disabled={busyReviewId !== null}
              onClick={() => addFaces.mutate(pendingFaceMerge)}
            >
              <MergeIcon aria-hidden />
              {busyReviewId === pendingFaceMerge.id ? "Adding…" : "Add faces"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Dismiss suggestion"
              disabled={busyReviewId !== null}
              onClick={() => dismiss(pendingFaceMerge.id)}
            >
              <XIcon aria-hidden />
              Not now
            </Button>
          </ReviewBannerActions>
        </ReviewBanner>
      ) : null}

      {pendingGroup ? (
        pendingGroup.target.personId === personId ? (
          <ReviewBanner aria-label="Similar people review">
            <ReviewBannerFaces>
              {pendingGroup.members.slice(0, 4).map((member) => (
                <FaceAvatar
                  key={member.personId}
                  faceId={member.coverFaceId}
                  size={40}
                  label={member.name ?? "Unnamed"}
                />
              ))}
            </ReviewBannerFaces>
            <ReviewBannerInfo>
              <strong>
                {pendingGroup.members.length} similar{" "}
                {pendingGroup.members.length === 1 ? "group looks" : "groups look"} like
                the same person
              </strong>
              <span>
                {pendingGroup.target.faceCount + pendingGroup.members.reduce((sum, m) => sum + m.faceCount, 0)}{" "}
                faces total · {Math.round(pendingGroup.minSimilarity * 100)}% match
              </span>
            </ReviewBannerInfo>
            <ReviewBannerActions>
              <Button
                size="sm"
                variant="outline"
                disabled={busyReviewId !== null}
                onClick={() => openReview("group")}
              >
                <ImagesIcon aria-hidden />
                Review faces
              </Button>
              <Button
                size="sm"
                disabled={busyReviewId !== null}
                onClick={() =>
                  mergeReviewed.mutate({
                    personIds: pendingGroup.members.map((m) => m.personId),
                    targetId: pendingGroup.target.personId,
                    suggestionId: pendingGroup.id,
                  })
                }
              >
                <MergeIcon aria-hidden />
                {busyReviewId === pendingGroup.id ? "Merging…" : "Merge all"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Dismiss suggestion"
                disabled={busyReviewId !== null}
                onClick={() => dismiss(pendingGroup.id)}
              >
                <XIcon aria-hidden />
                Not now
              </Button>
            </ReviewBannerActions>
          </ReviewBanner>
        ) : (
          <ReviewBanner aria-label="Similar person review">
            <ReviewBannerFaces>
              <FaceAvatar
                faceId={person?.coverFaceId}
                size={40}
                label={person?.name ?? "Unnamed"}
              />
              <FaceAvatar
                faceId={pendingGroup.target.coverFaceId}
                size={40}
                label={pendingGroup.target.name ?? "Unnamed"}
              />
            </ReviewBannerFaces>
            <ReviewBannerInfo>
              <strong>
                Same person as {pendingGroup.target.name ?? "Unnamed"}?
              </strong>
              <span>
                {pendingGroup.target.faceCount}{" "}
                {pendingGroup.target.faceCount === 1 ? "face" : "faces"} ·{" "}
                {Math.round(pendingGroup.minSimilarity * 100)}% match
              </span>
            </ReviewBannerInfo>
            <ReviewBannerActions>
              <Button
                size="sm"
                variant="outline"
                disabled={busyReviewId !== null}
                onClick={() => openReview("group")}
              >
                <ImagesIcon aria-hidden />
                Review faces
              </Button>
              <Button
                size="sm"
                disabled={busyReviewId !== null}
                onClick={() => mergeIntoTarget.mutate(pendingGroup)}
              >
                <MergeIcon aria-hidden />
                {busyReviewId === pendingGroup.id
                  ? "Merging…"
                  : pendingGroup.target.name
                    ? `Merge into ${pendingGroup.target.name}`
                    : "Merge"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Dismiss suggestion"
                disabled={busyReviewId !== null}
                onClick={() => dismiss(pendingGroup.id)}
              >
                <XIcon aria-hidden />
                Not now
              </Button>
            </ReviewBannerActions>
          </ReviewBanner>
        )
      ) : null}

      {confidence !== null ? (
        <ConfidenceBar role="status">
          <span>Match confidence</span>
          <ConfidenceTrack aria-hidden>
            <ConfidenceFill $value={confidence} />
          </ConfidenceTrack>
          <strong>{Math.round(confidence * 100)}%</strong>
        </ConfidenceBar>
      ) : null}

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

      {/* One-by-one review (doc 18 §7.4): the person as reference beside a
          single large candidate — judged one at a time, applied at the end. */}
      <Dialog
        open={reviewFor !== null && reviewItems.length > 0}
        onOpenChange={(open) => (!open ? setReviewFor(null) : null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Is this the same person?</DialogTitle>
            <DialogDescription>
              {reviewFor === "faces"
                ? "Compare each face with this person — accepted faces are added when you finish."
                : "Compare each group with the one that survives — merges apply when you finish."}
            </DialogDescription>
          </DialogHeader>

          <ReviewStep>
            <ReviewStepFigure>
              <FaceAvatar
                faceId={
                  reviewFor === "faces"
                    ? (person?.coverFaceId ?? null)
                    : (pendingGroup?.target.coverFaceId ?? null)
                }
                size={140}
                label="Reference person"
              />
              <span>
                {reviewFor === "faces"
                  ? (person?.name ?? "Unnamed")
                  : (pendingGroup?.target.name ?? "Unnamed")}
              </span>
            </ReviewStepFigure>
            <ReviewStepFigure>
              <FaceAvatar
                faceId={
                  reviewFor === "faces"
                    ? (reviewItems[stepIndex] ?? null)
                    : (pendingGroup?.members[stepIndex]?.coverFaceId ?? null)
                }
                size={140}
                label="Candidate"
              />
              <span>
                {reviewFor === "faces"
                  ? "Candidate face"
                  : `${stepMember?.name ?? "Unnamed"} · ${stepMember?.faceCount ?? 0} faces${
                      stepMember?.similarity != null
                        ? ` · ${Math.round(stepMember.similarity * 100)}% match`
                        : ""
                    }`}
              </span>
            </ReviewStepFigure>
          </ReviewStep>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
              {stepIndex + 1} of {reviewItems.length}
            </span>
            <ReviewProgress aria-hidden>
              <ReviewProgressFill
                $value={reviewItems.length > 0 ? stepIndex / reviewItems.length : 0}
              />
            </ReviewProgress>
          </div>

          <DialogFooter>
            {reviewFor === "faces" ? (
              <Button
                variant="ghost"
                disabled={busyReviewId !== null}
                onClick={() => advance("defer")}
              >
                <CircleHelpIcon aria-hidden />
                Not sure
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={busyReviewId !== null}
              onClick={() => (reviewFor === "faces" ? advance("reject") : skipStep())}
            >
              <XIcon aria-hidden />
              {reviewFor === "faces" ? "Not the same" : "Not now"}
            </Button>
            <Button disabled={busyReviewId !== null} onClick={() => advance("accept")}>
              <MergeIcon aria-hidden />
              {busyReviewId !== null
                ? reviewFor === "faces"
                  ? "Adding…"
                  : "Merging…"
                : reviewFor === "faces"
                  ? "Same person"
                  : "Same person — merge"}
            </Button>
          </DialogFooter>
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

/** Viewer cell for the person grid — no selection, tap to open. Sized through
 * CellWrap so the row spacing matches the gallery grid exactly. */
function PersonCell({ photo, size, onOpen }: { photo: CloudPhoto; size: number; onOpen: () => void }) {
  const isVideo = photo.mediaType === "Video";
  return (
    <CellWrap style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${photo.fileName}`}
        className="relative block size-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] bg-[var(--muted)]"
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
    </CellWrap>
  );
}
