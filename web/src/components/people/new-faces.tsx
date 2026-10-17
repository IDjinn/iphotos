"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listPersonSuggestionPage, type PersonSuggestion } from "@/data/people-repository";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import {
  DeckCard,
  DeckStack,
  DeckTileBox,
  PersonTileName,
  PersonTileSkeleton,
} from "./people.styles";

const PAGE_SIZE = 8;

/**
 * "New faces" review queue (doc 18 §7.4), paged: the tiles are laid out by the
 * people grid's own virtual list, so the whole page keeps ONE scroll. Held back
 * until `enabled` (the suggestions endpoint is the heavy one); dismissed ids
 * are filtered client-side.
 */
export function useNewFaces(enabled: boolean, dismissed: string[]) {
  const query = useInfiniteQuery({
    // Under the "people-suggestions" prefix: accepting a person invalidates it.
    queryKey: ["people-suggestions", "new-faces"],
    queryFn: ({ pageParam }) => listPersonSuggestionPage(pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled,
    staleTime: 60_000,
  });

  const cards = useMemo(() => {
    const byId = new Map<string, PersonSuggestion>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!dismissed.includes(item.id)) byId.set(item.id, item);
      }
    }
    return [...byId.values()];
  }, [query.data, dismissed]);

  return {
    cards,
    isPending: query.isPending,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    fetchNextPage: query.fetchNextPage,
  };
}

/** Loading twin of NewFacesDeck — same box as a person tile (circle + two lines). */
export function NewFacesDeckSkeleton({ avatarSize }: { avatarSize: number }) {
  return (
    <PersonTileSkeleton aria-hidden="true">
      <Skeleton
        className="rounded-full motion-reduce:animate-none"
        style={{ width: avatarSize, height: avatarSize }}
      />
      <Skeleton className="h-[0.8125rem] w-20 motion-reduce:animate-none" />
      <Skeleton className="h-8 w-20 motion-reduce:animate-none" />
    </PersonTileSkeleton>
  );
}

/** Cards fanned in the deck; the rest of the queue stays behind the dialog. */
const DECK_SIZE = 5;
const DECK_CYCLE_MS = 1000;

/**
 * Deck of up to five suggestion cards, overlapping in one person-sized tile.
 * The front card rotates to the back every few seconds (transform/opacity
 * only; paused on hover/focus, static under reduced motion), so the queue
 * "breathes" without taking space. The stack and the button open the review.
 */
export function NewFacesDeck({
  cards,
  hasMore,
  avatarSize,
  onReview,
}: {
  cards: PersonSuggestion[];
  hasMore: boolean;
  avatarSize: number;
  onReview: () => void;
}) {
  const deck = cards.slice(0, DECK_SIZE);
  const count = deck.length;
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setOffset((n) => n + 1), DECK_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  /** Position of card `index` in the stack: 0 is the front. */
  const positionOf = (index: number) => (((index - offset) % count) + count) % count;
  const label = `${cards.length}${hasMore ? "+" : ""} new ${cards.length === 1 && !hasMore ? "face" : "faces"}`;

  return (
    <DeckTileBox
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <DeckStack
        type="button"
        $size={avatarSize}
        onClick={onReview}
        aria-label={`Review ${label}`}
      >
        {deck.map((suggestion, index) => {
          const position = positionOf(index);
          return (
            <DeckCard
              key={suggestion.id}
              aria-hidden="true"
              style={{
                zIndex: count - position,
                opacity: position === 0 ? 1 : Math.max(0.3, 1 - position * 0.2),
                transform: `translate(${position * 7}px, ${position * -5}px) scale(${1 - position * 0.05})`,
              }}
            >
              <FaceAvatar faceId={suggestion.coverFaceId} size={avatarSize} label="Suggested face" />
            </DeckCard>
          );
        })}
      </DeckStack>
      <PersonTileName>{label}</PersonTileName>
      <Button size="sm" onClick={onReview}>
        Review
      </Button>
    </DeckTileBox>
  );
}
