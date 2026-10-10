"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOffIcon, MergeIcon, UserRoundPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  acceptMergeSuggestion,
  acceptPersonSuggestion,
  listPeople,
  listPersonSuggestions,
  type MergeSuggestion,
  type Person,
  type PersonSuggestion,
} from "@/data/people-repository";
import { SkeletonGrid, StatusArea, StatusBox } from "@/components/gallery/gallery.styles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceAvatar } from "./face-avatar";
import {
  CountLabel,
  PeopleGrid,
  PeopleHeader,
  PersonTile,
  PersonTileCount,
  PersonTileName,
  ReviewActions,
  ReviewCard,
  ReviewFaces,
  ReviewInfo,
  ReviewMore,
  SectionTitle,
} from "./people.styles";

const DISMISSED_KEY = "iphotos.dismissed-person-suggestions";

function loadDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * People hub (doc 18 §10), Google-Photos style: named people first, unnamed
 * auto-groups after. A person with pending faces shows the "same person?" review
 * card in their own grid slot; clusters that match nobody sit under New faces.
 */
export function PeopleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const peopleQuery = useQuery({ queryKey: ["people"], queryFn: listPeople });
  const suggestionsQuery = useQuery({
    queryKey: ["people-suggestions"],
    queryFn: listPersonSuggestions,
  });
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);
  /** The suggestion whose action is in flight — only its button disables. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
  };

  const create = useMutation({
    mutationFn: (suggestion: PersonSuggestion) => acceptPersonSuggestion(suggestion.faceIds),
    onMutate: (suggestion) => setBusyId(suggestion.id),
    onSuccess: async (person) => {
      setBusyId(null);
      await invalidate();
      toast.success("Person created");
      router.push(`/people/${person.id}`);
    },
    onError: () => {
      setBusyId(null);
      toast.error("Couldn't create the person. Try again.");
    },
  });

  const merge = useMutation({
    mutationFn: (suggestion: MergeSuggestion) =>
      acceptMergeSuggestion(suggestion.personId, suggestion.faceIds),
    onMutate: (suggestion) => setBusyId(suggestion.id),
    onSuccess: async (_data, suggestion) => {
      setBusyId(null);
      await invalidate();
      toast.success(`Added to ${suggestion.personName ?? "the person"}`);
    },
    onError: () => {
      setBusyId(null);
      toast.error("Couldn't add the faces. Try again.");
    },
  });

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Private mode — dismissal lasts for the session only.
    }
  };

  const people = peopleQuery.data ?? [];
  const named = people.filter((p) => p.name !== null);
  const unnamed = people.filter((p) => p.name === null);
  const newPeople = (suggestionsQuery.data?.newPeople ?? []).filter(
    (s) => !dismissed.includes(s.id),
  );
  const merges = (suggestionsQuery.data?.merges ?? []).filter(
    (s) => !dismissed.includes(s.id),
  );
  const mergeByPerson = useMemo(
    () => new Map(merges.map((s) => [s.personId, s])),
    [merges],
  );

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

  /** A person's grid slot: the review card when the queue has faces for them,
   * the plain circle tile otherwise. */
  const renderPerson = (person: Person) => {
    const pending = mergeByPerson.get(person.id);
    if (pending) {
      return (
        <MergeReviewCard
          key={`review-${pending.id}`}
          suggestion={pending}
          busy={busyId === pending.id}
          onAccept={() => merge.mutate(pending)}
          onDismiss={() => dismiss(pending.id)}
        />
      );
    }

    return (
      <PersonTile
        key={person.id}
        onClick={() => router.push(`/people/${person.id}`)}
        aria-label={person.name ?? "Unnamed person"}
      >
        <FaceAvatar faceId={person.coverFaceId} size={80} label={person.name ?? "Unnamed"} />
        <PersonTileName>{person.name ?? "Unnamed"}</PersonTileName>
        <PersonTileCount>
          {person.faceCount} {person.faceCount === 1 ? "face" : "faces"}
        </PersonTileCount>
      </PersonTile>
    );
  };

  const isEmpty = people.length === 0 && merges.length === 0 && newPeople.length === 0;

  return (
    <>
      <PeopleHeader>
        <h1>People</h1>
        <CountLabel>{people.length > 0 ? `${people.length}` : ""}</CountLabel>
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
          {named.length > 0 ? <PeopleGrid>{named.map(renderPerson)}</PeopleGrid> : null}

          {unnamed.length > 0 ? (
            <>
              <SectionTitle>Unnamed</SectionTitle>
              <PeopleGrid>{unnamed.map(renderPerson)}</PeopleGrid>
            </>
          ) : null}

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
}

/** Review card for one person's candidate faces ("Alice — same person?"). */
function MergeReviewCard({
  suggestion,
  busy,
  onAccept,
  onDismiss,
}: {
  suggestion: MergeSuggestion;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <ReviewCard>
      <ReviewFaces>
        <FaceAvatar
          faceId={suggestion.personCoverFaceId}
          size={40}
          label={suggestion.personName ?? "Unnamed"}
        />
        <FaceAvatar faceId={suggestion.coverFaceId} size={40} label="Suggested face" />
        {suggestion.faceCount > 1 ? <ReviewMore>+{suggestion.faceCount - 1}</ReviewMore> : null}
      </ReviewFaces>
      <ReviewInfo>
        <strong>{suggestion.personName ?? "Unnamed"} — same person?</strong>
        <span>
          {suggestion.faceCount} new {suggestion.faceCount === 1 ? "face" : "faces"} ·{" "}
          {Math.round(suggestion.similarity * 100)}% match
        </span>
      </ReviewInfo>
      <ReviewActions>
        <Button size="sm" disabled={busy} onClick={onAccept}>
          <MergeIcon aria-hidden />
          {busy ? "Adding…" : `Add to ${suggestion.personName ?? "this person"}`}
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
