"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckCheckIcon,
  ScanFaceIcon,
  UserRoundPlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  acceptMergeSuggestion,
  acceptPersonSuggestion,
  listSuggestionPhotos,
  type Person,
  type PersonSuggestion,
} from "@/data/people-repository";
import { useViewerStore } from "@/stores/ui";
import { AuthImage } from "@/components/media/auth-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import { useNewFaces } from "./new-faces";
import { PersonPickerDialog } from "./person-picker-dialog";
import { CountLabel, PeopleHeader } from "./people.styles";
import {
  CardActions,
  CardHeading,
  CardOpen,
  CaughtUp,
  DetailsLabel,
  FaceStrip,
  ListFooter,
  PhotoButton,
  PhotoCell,
  PhotoGrid,
  ReviewGrid,
  ReviewScroll,
  SuggestionCard,
} from "./review-screen.styles";
import { useSuggestionDismissals } from "./use-suggestion-dismissals";

const MAX_FACES = 12;
const MAX_PHOTOS = 6;
/** The expanded view shows the whole cluster; faces are capped for the DOM. */
const MAX_DETAIL_FACES = 80;
const PHOTO_PAGE_SIZE = 24;

/**
 * Review of every "New faces" suggestion (doc 18 §7.4) on one page: each card
 * shows the cluster's faces and a few of its photos, with Create person / Not
 * now right on it, so a whole queue can be cleared in one pass. Infinite and
 * single-scroll — the queue pages in as the list nears its end. Create keeps
 * you here (the card leaves); "Skip" is remembered across screens.
 */
export function ReviewScreen() {
  const queryClient = useQueryClient();
  const { dismissed, dismiss } = useSuggestionDismissals();
  const queue = useNewFaces(true, dismissed);
  /** Created in this visit — hidden at once, before the refetch lands. */
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (suggestion: PersonSuggestion) => acceptPersonSuggestion(suggestion.faceIds),
    onMutate: (suggestion) => setBusyId(suggestion.id),
    onSuccess: async (_person, suggestion) => {
      setBusyId(null);
      setCreated((prev) => new Set(prev).add(suggestion.id));
      toast.success("Person created");
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
    },
    onError: () => {
      setBusyId(null);
      toast.error("Couldn't create the person. Try again.");
    },
  });

  /** Folds the suggestion into an existing person — no duplicate is created. */
  const assign = useMutation({
    mutationFn: ({ suggestion, person }: { suggestion: PersonSuggestion; person: Person }) =>
      acceptMergeSuggestion(person.id, suggestion.faceIds),
    onMutate: ({ suggestion }) => setBusyId(suggestion.id),
    onSuccess: async (_data, { suggestion, person }) => {
      setBusyId(null);
      setCreated((prev) => new Set(prev).add(suggestion.id));
      toast.success(`Added to ${person.name ?? "an unnamed person"}`);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
    },
    onError: () => {
      setBusyId(null);
      toast.error("Couldn't add the faces. Try again.");
    },
  });

  const cards = queue.cards.filter((card) => !created.has(card.id));
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = queue;

  // Infinite scroll: a sentinel under the list pulls the next window before the
  // end. The page's scroll box is the observer root, so the margin applies; the
  // observer is re-created on fetch flips so a still-visible sentinel re-fires
  // (also after cards leave and shrink the list).
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollEl || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError
        ) {
          void fetchNextPage();
        }
      },
      { root: scrollEl, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollEl, sentinel, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  return (
    <>
      <PeopleHeader>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/people">
            <ArrowLeftIcon aria-hidden />
            People
          </Link>
        </Button>
        <h1>Review faces</h1>
        <CountLabel>
          {cards.length > 0 ? `${cards.length}${hasNextPage ? "+" : ""}` : ""}
        </CountLabel>
      </PeopleHeader>

      <ReviewScroll ref={setScrollEl}>
        {queue.isPending ? (
          <ReviewGrid aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <SuggestionSkeleton key={i} />
            ))}
          </ReviewGrid>
        ) : cards.length === 0 && !hasNextPage ? (
          <CaughtUp>
            <CheckCheckIcon aria-hidden className="size-8" />
            <strong>All caught up</strong>
            <p>No more suggestions to review right now.</p>
            <Button variant="outline" asChild>
              <Link href="/people">Back to people</Link>
            </Button>
          </CaughtUp>
        ) : (
          <>
            <ReviewGrid>
              {cards.map((suggestion) => (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  busy={busyId === suggestion.id}
                  onCreate={() => create.mutate(suggestion)}
                  onAssign={(person) => assign.mutate({ suggestion, person })}
                  onDismiss={() => dismiss(suggestion.id)}
                />
              ))}
              {isFetchingNextPage ? <SuggestionSkeleton /> : null}
            </ReviewGrid>
            {hasNextPage ? <div ref={setSentinel} aria-hidden="true" /> : null}
            {isFetchNextPageError ? (
              <ListFooter>
                <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
                  Couldn&apos;t load more. Try again
                </Button>
              </ListFooter>
            ) : null}
          </>
        )}
      </ReviewScroll>
    </>
  );
}

function SuggestionItem({
  suggestion,
  busy,
  onCreate,
  onAssign,
  onDismiss,
}: {
  suggestion: PersonSuggestion;
  busy: boolean;
  onCreate: () => void;
  onAssign: (person: Person) => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const faces = [
    suggestion.coverFaceId,
    ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId),
  ].filter((id): id is string => !!id);
  const photos = suggestion.samplePhotoIds.slice(0, MAX_PHOTOS);
  const faceLabel = `${suggestion.faceCount} ${suggestion.faceCount === 1 ? "face" : "faces"}`;

  return (
    <SuggestionCard>
      <CardOpen type="button" onClick={() => setOpen(true)} aria-label={`Review ${faceLabel}`}>
        <CardHeading>
          <strong>{faceLabel}</strong>
          <span>Same person?</span>
        </CardHeading>
        <FaceStrip>
          {faces.slice(0, MAX_FACES).map((faceId) => (
            <FaceAvatar key={faceId} faceId={faceId} size={56} label="Face in this group" />
          ))}
        </FaceStrip>
        {photos.length > 0 ? (
          <PhotoGrid>
            {photos.map((photoId) => (
              <PhotoCell key={photoId}>
                <AuthImage
                  fill
                  photo={{ id: photoId, fileName: "Photo with this person", width: undefined, height: undefined }}
                />
              </PhotoCell>
            ))}
          </PhotoGrid>
        ) : null}
      </CardOpen>

      <CardActions>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
          Skip
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ScanFaceIcon aria-hidden />
          Review
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setPicking(true)}>
          <UsersIcon aria-hidden />
          Add to person
        </Button>
        <Button size="sm" disabled={busy} onClick={onCreate}>
          <UserRoundPlusIcon aria-hidden />
          {busy ? "Creating…" : "Create person"}
        </Button>
      </CardActions>

      {/* Created / dismissed cards leave the list, which unmounts this modal. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review {faceLabel}</DialogTitle>
            <DialogDescription>
              Every face and photo of this group. Open a photo to inspect it, then decide.
            </DialogDescription>
          </DialogHeader>
          <SuggestionDetails suggestion={suggestion} faces={faces} />
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={onDismiss}>
              Skip
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setPicking(true)}>
              <UsersIcon aria-hidden />
              Add to person
            </Button>
            <Button disabled={busy} onClick={onCreate}>
              <UserRoundPlusIcon aria-hidden />
              {busy ? "Creating…" : "Create person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PersonPickerDialog
        open={picking}
        onOpenChange={setPicking}
        faceCount={suggestion.faceIds.length}
        busy={busy}
        onConfirm={onAssign}
      />
    </SuggestionCard>
  );
}

/** The whole cluster: every face and every photo (paged). Photos open in the
 * shared viewer, where the full-size preview can be inspected. */
function SuggestionDetails({
  suggestion,
  faces,
}: {
  suggestion: PersonSuggestion;
  faces: string[];
}) {
  const openViewer = useViewerStore((s) => s.open);
  const query = useInfiniteQuery({
    queryKey: ["people-suggestions", "photos", suggestion.id],
    queryFn: ({ pageParam }) => listSuggestionPhotos(suggestion.id, pageParam, PHOTO_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    // The cluster id is a hash of its faces: a missing one is gone, not flaky.
    retry: false,
  });
  const photos = query.data?.pages.flatMap((page) => page.items) ?? [];
  const totalPhotos = query.data?.pages[0]?.totalCount ?? 0;
  const shownFaces = faces.slice(0, MAX_DETAIL_FACES);

  return (
    <>
      <DetailsLabel>
        Faces ({faces.length}
        {faces.length < suggestion.faceCount ? ` of ${suggestion.faceCount}` : ""})
      </DetailsLabel>
      <FaceStrip>
        {shownFaces.map((faceId) => (
          <FaceAvatar key={faceId} faceId={faceId} size={56} label="Face in this group" />
        ))}
      </FaceStrip>
      {faces.length > shownFaces.length ? (
        <DetailsLabel>+{faces.length - shownFaces.length} more faces</DetailsLabel>
      ) : null}

      <DetailsLabel>
        Photos{query.isSuccess ? ` (${totalPhotos})` : ""}
      </DetailsLabel>
      {query.isError ? (
        <DetailsLabel>This suggestion is no longer available.</DetailsLabel>
      ) : (
        <PhotoGrid aria-busy={query.isPending}>
          {query.isPending
            ? Array.from({ length: 8 }, (_, i) => (
                <PhotoCell key={i}>
                  <Skeleton className="absolute inset-0 motion-reduce:animate-none" />
                </PhotoCell>
              ))
            : photos.map((photo, index) => (
                <PhotoButton
                  key={photo.id}
                  type="button"
                  aria-label={`Open ${photo.fileName}`}
                  onClick={() =>
                    openViewer(
                      photos.map((p) => p.id),
                      index,
                    )
                  }
                >
                  <AuthImage fill photo={photo} />
                </PhotoButton>
              ))}
        </PhotoGrid>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more photos"}
        </Button>
      ) : null}
    </>
  );
}

/** Loading twin of SuggestionItem — same blocks, so cards replace it in place. */
function SuggestionSkeleton() {
  return (
    <SuggestionCard aria-hidden="true">
      <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
      <FaceStrip>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="size-14 rounded-full motion-reduce:animate-none" />
        ))}
      </FaceStrip>
      <PhotoGrid>
        {Array.from({ length: MAX_PHOTOS }, (_, i) => (
          <PhotoCell key={i}>
            <Skeleton className="absolute inset-0 motion-reduce:animate-none" />
          </PhotoCell>
        ))}
      </PhotoGrid>
      <CardActions>
        <Skeleton className="h-8 w-20 motion-reduce:animate-none" />
        <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
      </CardActions>
    </SuggestionCard>
  );
}
