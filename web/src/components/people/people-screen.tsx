"use client";

import { useCallback, useEffect, useMemo, useState, useDeferredValue } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ImageOffIcon,
  ListFilterIcon,
} from "lucide-react";
import {
  listPeoplePage,
  listPersonSuggestions,
  type PeopleFilter,
  type Person,
} from "@/data/people-repository";
import { prefetchFaceCrops } from "@/data/blob-cache";
import { StatusArea, StatusBox } from "@/components/gallery/gallery.styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FaceAvatar } from "./face-avatar";
import { NewFacesDeck, NewFacesDeckSkeleton, useNewFaces } from "./new-faces";
import { PeopleSkeletonGrid } from "./people-skeleton";
import {
  CountLabel,
  GridFooter,
  PeopleArea,
  PeopleHeader,
  PeopleRow,
  PeopleRowTiles,
  PeopleRows,
  PeopleRowsInner,
  PeopleScroll,
  PersonTile,
  PersonTileCount,
  PersonTileName,
  ReviewBadge,
  RowTitle,
} from "./people.styles";
import { useSuggestionDismissals } from "./use-suggestion-dismissals";

/** Cover circle diameter in px (face crops are 160px, so this stays sharp). */
const AVATAR_SIZE = 104;
/** Window size — also the number of faces kept preloaded ahead of the scroll. */
const PAGE_SIZE = 20;
/** How long a prefetched window is reused before a re-request. */
const WINDOW_STALE_MS = 30_000;
/** Grid geometry of the virtual rows (px): min tile width, gap, and the fixed
 * row heights. Fixed sizes keep the virtualizer from measuring every row (no
 * per-row ResizeObserver, no layout shifts while scrolling); the tile row fits
 * the tallest tile (cover + name + count + the optional "groups" line). */
const TILE_MIN_WIDTH = 144;
const TILE_GAP = 8;
const TILE_ROW_HEIGHT = 208 + TILE_GAP;
const TITLE_ROW_HEIGHT = 48;
/** The suggestion deck is a pseudo-item: it takes the first cell of the grid. */
const DECK = { deck: true } as const;
type GridItem = Person | typeof DECK;

type PeopleListRow =
  | { kind: "title"; key: string; text: string }
  | { kind: "tiles"; key: string; items: GridItem[] };

/**
 * People hub (doc 18 §10), Google-Photos style: named people first, unnamed
 * auto-groups after. A uniform circle grid over an endless paged window —
 * pages append as the grid scrolls (the request never materializes every
 * person). Pending "same person?" reviews show as a dot on the tile and are
 * resolved inside the person's page, where the merge happens over the photo
 * grid. Clusters that match nobody sit under New faces. Filters live in the
 * URL (gallery convention).
 */
export function PeopleScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const name = searchParams.get("name") ?? "";
  const isNamed = searchParams.get("isNamed");
  // Primitives, not an object literal: a fresh object every render never
  // compares equal, so React would keep scheduling deferred re-renders forever.
  const deferred = { name: useDeferredValue(name), isNamed: useDeferredValue(isNamed) };
  const hasFilters = Boolean(name || isNamed);

  const filter = useMemo<PeopleFilter>(
    () => ({
      name: deferred.name || undefined,
      isNamed:
        deferred.isNamed === "true" ? true : deferred.isNamed === "false" ? false : undefined,
    }),
    [deferred.name, deferred.isNamed],
  );
  /** One window through the query cache: the scroll buffer below fetches the
   * next window ahead of time under the same key, so reaching it is instant. */
  const fetchWindow = useCallback(
    (page: number) =>
      queryClient.fetchQuery({
        queryKey: ["people", "window", filter, page],
        queryFn: () => listPeoplePage(page, PAGE_SIZE, filter),
        staleTime: WINDOW_STALE_MS,
      }),
    [queryClient, filter],
  );

  const peopleQuery = useInfiniteQuery({
    queryKey: ["people", deferred],
    queryFn: ({ pageParam }) => fetchWindow(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isPlaceholderData,
  } = peopleQuery;
  // The suggestions endpoint is the heavy one (clusters every unassigned face):
  // it waits for the first window so the grid's own requests get the line first.
  const suggestionsQuery = useQuery({
    queryKey: ["people-suggestions"],
    queryFn: listPersonSuggestions,
    enabled: peopleQuery.data !== undefined,
    staleTime: 60_000,
  });

  // Always keep the next window (PAGE_SIZE people) fetched and its face crops
  // downloaded, so scrolling never waits on the network.
  const lastWindow = peopleQuery.data?.pages.at(-1);
  const nextWindow =
    lastWindow && lastWindow.page < lastWindow.totalPages ? lastWindow.page + 1 : null;
  useEffect(() => {
    if (nextWindow === null || isPlaceholderData) return;
    let cancelled = false;
    fetchWindow(nextWindow)
      .then((next) => {
        if (!cancelled) {
          prefetchFaceCrops(
            queryClient,
            next.items.map((person) => person.coverFaceId),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [nextWindow, isPlaceholderData, fetchWindow, queryClient]);
  const { dismissed } = useSuggestionDismissals();
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(params.size ? `/people?${params.toString()}` : "/people");
  };
  const clearFilters = () => router.push("/people");

  const people = useMemo(
    () => (peopleQuery.data ? peopleQuery.data.pages.flatMap((page) => page.items) : []),
    [peopleQuery.data],
  );
  const totalCount = peopleQuery.data?.pages[0]?.totalCount ?? 0;

  /** Pending duplicate groups (not dismissed): members hide behind the target's
   * tile so the hub shows one entry per visual person — nothing is merged until
   * the review is accepted on the person's page (doc 18 §7.4). */
  const activeGroups = useMemo(
    () =>
      (suggestionsQuery.data?.personMergeGroups ?? []).filter(
        (g) => !dismissed.includes(g.id),
      ),
    [suggestionsQuery.data, dismissed],
  );
  const collapsedMemberIds = useMemo(
    () => new Set(activeGroups.flatMap((g) => g.members.map((m) => m.personId))),
    [activeGroups],
  );
  const groupByTarget = useMemo(
    () => new Map(activeGroups.map((g) => [g.target.personId, g])),
    [activeGroups],
  );


  /** People with a pending review — the dot that leads to their page. `?? []`
   * tolerates stale cached payloads that predate personMergeGroups. */
  const pendingReview = useMemo(() => {
    const data = suggestionsQuery.data;
    const ids = new Set<string>();
    if (!data) return ids;
    for (const merge of data.merges ?? []) {
      if (!dismissed.includes(merge.id)) ids.add(merge.personId);
    }
    for (const group of data.personMergeGroups ?? []) {
      if (dismissed.includes(group.id)) continue;
      ids.add(group.target.personId);
      for (const member of group.members) ids.add(member.personId);
    }
    return ids;
  }, [suggestionsQuery.data, dismissed]);

  // Windowed grid: only the rows near the viewport are in the DOM, however many
  // people have been paged in. Columns follow the measured width.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(1024);
  useEffect(() => {
    if (!gridEl) return;
    const compute = () => setGridWidth(gridEl.clientWidth);
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl]);
  const newFaces = useNewFaces(peopleQuery.data !== undefined, dismissed);
  const { cards } = newFaces;
  /** The deck holds the first grid cell while suggestions exist (or load). */
  const hasDeck = !hasFilters && (cards.length > 0 || newFaces.isPending);
  const columns = Math.max(1, Math.floor((gridWidth + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)));

  const rows = useMemo(() => {
    const visible = (p: Person) => !collapsedMemberIds.has(p.id);
    const namedPeople: GridItem[] = people.filter((p) => p.name !== null && visible(p));
    const unnamedPeople: GridItem[] = people.filter((p) => p.name === null && visible(p));
    const out: PeopleListRow[] = [];
    const push = (prefix: string, list: GridItem[]) => {
      for (let i = 0; i < list.length; i += columns) {
        const first = list[i];
        out.push({
          kind: "tiles",
          key: `${prefix}:${"deck" in first ? "deck" : first.id}`,
          items: list.slice(i, i + columns),
        });
      }
    };
    push("named", hasDeck ? [DECK, ...namedPeople] : namedPeople);
    if (unnamedPeople.length > 0) {
      out.push({ kind: "title", key: "unnamed-title", text: "Unnamed" });
      push("unnamed", unnamedPeople);
    }
    return out;
  }, [people, collapsedMemberIds, columns, hasDeck]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) =>
      rows[index]?.kind === "title" ? TITLE_ROW_HEIGHT : TILE_ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 4,
    // Scroll events re-render through a normal (batched) update, not flushSync.
    useFlushSync: false,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Infinite scroll: pull the next window when the last rendered row nears the
  // end of the list (the window is already prefetched, so it lands instantly).
  // Paused during placeholder data (a filter switch would fetch page 2 of the
  // previous filter) and after an error (retry is explicit).
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;
  useEffect(() => {
    if (
      lastVirtualIndex >= rows.length - 2 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError &&
      !isPlaceholderData
    ) {
      void fetchNextPage();
    }
  }, [
    lastVirtualIndex,
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isPlaceholderData,
    fetchNextPage,
  ]);

  if (peopleQuery.isError) {
    return (
      <StatusArea>
        <StatusBox role="alert">
          <ImageOffIcon aria-hidden />
          <h2>Couldn&apos;t load your people</h2>
          <p>Check your connection and try again.</p>
          <Button
            variant="outline"
            onClick={() => void peopleQuery.refetch()}
            disabled={peopleQuery.isFetching}
          >
            Try again
          </Button>
        </StatusBox>
      </StatusArea>
    );
  }

  if (peopleQuery.isLoading) {
    return (
      <>
        <PeopleHeader>
          <h1>People</h1>
        </PeopleHeader>
        <div aria-busy="true">
          <PeopleSkeletonGrid count={PAGE_SIZE} />
        </div>
      </>
    );
  }

  return (
    <>
      <PeopleHeader>
        <h1>People</h1>
        <CountLabel>{totalCount > 0 ? `${totalCount}` : ""}</CountLabel>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" aria-label="Filter people">
              <ListFilterIcon aria-hidden />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-people-name">Name</Label>
                <Input
                  id="filter-people-name"
                  defaultValue={name}
                  placeholder="Search by name"
                  onBlur={(event) => setFilter("name", event.target.value.trim())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      setFilter("name", event.currentTarget.value.trim());
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Show</Label>
                <div className="flex gap-1.5" role="group" aria-label="Filter by named status">
                  <Button
                    variant={isNamed === null ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFilter("isNamed", "")}
                  >
                    All
                  </Button>
                  <Button
                    variant={isNamed === "true" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFilter("isNamed", "true")}
                  >
                    Named
                  </Button>
                  <Button
                    variant={isNamed === "false" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFilter("isNamed", "false")}
                  >
                    Unnamed
                  </Button>
                </div>
              </div>
              {hasFilters ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </PeopleHeader>

      {totalCount === 0 ? (
        <StatusArea>
          <StatusBox>
            {hasFilters ? (
              <>
                <h2>No people match your filters</h2>
                <p>Try a different name, or clear the filters to see everyone.</p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <h2>No people yet</h2>
                <p>
                  People show up here as face processing finds them in your photos. Uploads
                  are indexed automatically.
                </p>
              </>
            )}
          </StatusBox>
        </StatusArea>
      ) : (
        <PeopleScroll ref={setScrollEl}>
          <PeopleArea $dimmed={peopleQuery.isPlaceholderData}>
            <PeopleRows>
              <PeopleRowsInner ref={setGridEl} style={{ height: virtualizer.getTotalSize() }}>
                {virtualItems.map((item) => {
                  const row = rows[item.index];
                  if (!row) return null;
                  const position = {
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  };
                  return row.kind === "title" ? (
                    <RowTitle key={item.key} style={position}>
                      {row.text}
                    </RowTitle>
                  ) : (
                    <PeopleRow key={item.key} style={position}>
                      <PeopleRowTiles $columns={columns}>
                        {row.items.map((entry) =>
                          "deck" in entry ? (
                            <div key="deck">{renderDeck()}</div>
                          ) : (
                            renderPerson(entry)
                          ),
                        )}
                      </PeopleRowTiles>
                    </PeopleRow>
                  );
                })}
              </PeopleRowsInner>
            </PeopleRows>

            {isFetchingNextPage ? <PeopleSkeletonGrid count={columns} /> : null}
            {isFetchNextPageError ? (
              <GridFooter>
                <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
                  Couldn&apos;t load more. Try again
                </Button>
              </GridFooter>
            ) : null}
          </PeopleArea>
        </PeopleScroll>
      )}
    </>
  );

  /** The suggestion deck (one grid cell); a skeleton while the queue loads. */
  function renderDeck() {
    if (cards.length === 0) return <NewFacesDeckSkeleton avatarSize={AVATAR_SIZE} />;
    return (
      <NewFacesDeck
        cards={cards}
        hasMore={newFaces.hasNextPage}
        avatarSize={AVATAR_SIZE}
        onReview={() => router.push("/people/review")}
      />
    );
  }

  /** Every slot is the same circle tile — pending reviews only add a dot, and a
   * merge target shows how many duplicate groups are waiting behind it. */
  function renderPerson(person: Person) {
    const group = groupByTarget.get(person.id);
    return (
      <PersonTile
        key={person.id}
        onClick={() => router.push(`/people/${person.id}`)}
        aria-label={person.name ?? "Unnamed person"}
      >
        {pendingReview.has(person.id) ? <ReviewBadge aria-hidden /> : null}
        <FaceAvatar faceId={person.coverFaceId} size={AVATAR_SIZE} label={person.name ?? "Unnamed"} />
        <PersonTileName>{person.name ?? "Unnamed"}</PersonTileName>
        <PersonTileCount>
          {person.faceCount} {person.faceCount === 1 ? "face" : "faces"}
        </PersonTileCount>
        {group ? (
          <PersonTileCount>
            +{group.members.length} {group.members.length === 1 ? "group" : "groups"} · review
          </PersonTileCount>
        ) : null}
      </PersonTile>
    );
  }
}
