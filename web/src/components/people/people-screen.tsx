"use client";

import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ImageOffIcon,
  ListFilterIcon,
  UserRoundPlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  acceptPersonSuggestion,
  listPeoplePage,
  listPersonSuggestions,
  type Person,
  type PersonSuggestion,
} from "@/data/people-repository";
import { SkeletonGrid, StatusArea, StatusBox } from "@/components/gallery/gallery.styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import {
  CountLabel,
  GridFooter,
  PeopleArea,
  PeopleGrid,
  PeopleHeader,
  PersonTile,
  PersonTileCount,
  PersonTileName,
  ReviewActions,
  ReviewBadge,
  ReviewCard,
  ReviewFaces,
  ReviewInfo,
  SectionTitle,
} from "./people.styles";
import { useSuggestionDismissals } from "./use-suggestion-dismissals";

const PAGE_SIZE = 50;

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
  const deferred = useDeferredValue({ name, isNamed });
  const hasFilters = Boolean(name || isNamed);

  const peopleQuery = useInfiniteQuery({
    queryKey: ["people", deferred],
    queryFn: ({ pageParam }) =>
      listPeoplePage(pageParam, PAGE_SIZE, {
        name: deferred.name || undefined,
        isNamed:
          deferred.isNamed === "true"
            ? true
            : deferred.isNamed === "false"
              ? false
              : undefined,
      }),
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
  const suggestionsQuery = useQuery({
    queryKey: ["people-suggestions"],
    queryFn: listPersonSuggestions,
  });
  const { dismissed, dismiss } = useSuggestionDismissals();
  /** The suggestion whose action is in flight — only its button disables. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (suggestion: PersonSuggestion) => acceptPersonSuggestion(suggestion.faceIds),
    onMutate: (suggestion) => setBusyId(suggestion.id),
    onSuccess: async (person) => {
      setBusyId(null);
      // Prefix key: refetches the visible page AND the merge-dialog listing.
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
      toast.success("Person created");
      router.push(`/people/${person.id}`);
    },
    onError: () => {
      setBusyId(null);
      toast.error("Couldn't create the person. Try again.");
    },
  });

  // Infinite scroll: a sentinel under the grid pulls the next window before
  // the user reaches the bottom. Paused while placeholder data shows (a filter
  // change would otherwise fetch page 2 of the previous filter); the observer
  // is re-created on fetch flips so a still-visible sentinel re-fires once a
  // window lands without the user having to nudge the scroll.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !isPlaceholderData &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData]);

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

  const named = people.filter((p) => p.name !== null && !collapsedMemberIds.has(p.id));
  const unnamed = people.filter((p) => p.name === null && !collapsedMemberIds.has(p.id));
  const newPeople = (suggestionsQuery.data?.newPeople ?? []).filter(
    (s) => !dismissed.includes(s.id),
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
        <SkeletonGrid aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </SkeletonGrid>
      </>
    );
  }

  const isEmpty = totalCount === 0 && newPeople.length === 0;

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

      {isEmpty ? (
        <StatusArea>
          <StatusBox>
            <h2>No people yet</h2>
            <p>
              People show up here as face processing finds them in your photos. Uploads
              are indexed automatically.
            </p>
          </StatusBox>
        </StatusArea>
      ) : (
        <>
          <PeopleArea $dimmed={peopleQuery.isPlaceholderData}>
            {totalCount === 0 ? (
              <StatusArea>
                <StatusBox>
                  <h2>No people match your filters</h2>
                  <p>Try a different name, or clear the filters to see everyone.</p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </StatusBox>
              </StatusArea>
            ) : (
              <>
                {named.length > 0 ? <PeopleGrid>{named.map(renderPerson)}</PeopleGrid> : null}

                {unnamed.length > 0 ? (
                  <>
                    <SectionTitle>Unnamed</SectionTitle>
                    <PeopleGrid>{unnamed.map(renderPerson)}</PeopleGrid>
                  </>
                ) : null}
              </>
            )}

            {hasNextPage || isFetchingNextPage ? (
              <>
                <div ref={setSentinel} aria-hidden="true" />
                {isFetchingNextPage ? (
                  <PeopleGrid aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <Skeleton className="size-20 rounded-full" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </PeopleGrid>
                ) : null}
                {isFetchNextPageError ? (
                  <GridFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchNextPage()}
                    >
                      Couldn&apos;t load more. Try again
                    </Button>
                  </GridFooter>
                ) : null}
              </>
            ) : null}
          </PeopleArea>

          {newPeople.length > 0 ? (
            <>
              <SectionTitle>New faces</SectionTitle>
              <PeopleGrid>
                {newPeople.map((suggestion) => (
                  <NewPersonCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    busy={busyId === suggestion.id}
                    onCreate={() => create.mutate(suggestion)}
                    onDismiss={() => dismiss(suggestion.id)}
                  />
                ))}
              </PeopleGrid>
            </>
          ) : null}
        </>
      )}
    </>
  );

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
        <FaceAvatar faceId={person.coverFaceId} size={80} label={person.name ?? "Unnamed"} />
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

/** Review card for a cluster that matches no existing person — creating a person
 * groups the faces. */
function NewPersonCard({
  suggestion,
  busy,
  onCreate,
  onDismiss,
}: {
  suggestion: PersonSuggestion;
  busy: boolean;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const faces = [
    suggestion.coverFaceId,
    ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId),
  ].slice(0, 4);

  return (
    <ReviewCard>
      <ReviewFaces>
        {faces.map((faceId, index) => (
          <FaceAvatar key={faceId ?? index} faceId={faceId} size={40} label="Suggested face" />
        ))}
      </ReviewFaces>
      <ReviewInfo>
        <strong>
          {suggestion.faceCount} {suggestion.faceCount === 1 ? "face" : "faces"}
        </strong>
        <span>These may be the same new person.</span>
      </ReviewInfo>
      <ReviewActions>
        <Button size="sm" disabled={busy} onClick={onCreate}>
          <UserRoundPlusIcon aria-hidden />
          {busy ? "Creating…" : "Create person"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
        >
          <XIcon aria-hidden />
          Not now
        </Button>
      </ReviewActions>
    </ReviewCard>
  );
}
