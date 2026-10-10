"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOffIcon, UserRoundPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  acceptPersonSuggestion,
  listPeople,
  listPersonSuggestions,
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
  SectionTitle,
  SuggestionActions,
  SuggestionCard,
  SuggestionFaces,
  SuggestionInfo,
  SuggestionList,
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
 * People hub (doc 18 §10): the person circles plus the "same person?" review
 * queue — unassigned faces the clusterer found above the suggestion threshold.
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
  /** The suggestion whose "Create person" is in flight — only its button disables. */
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (suggestion: PersonSuggestion) => acceptPersonSuggestion(suggestion.faceIds),
    onMutate: (suggestion) => setAcceptingId(suggestion.id),
    onSuccess: async (person) => {
      setAcceptingId(null);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people-suggestions"] });
      toast.success("Person created");
      router.push(`/people/${person.id}`);
    },
    onError: () => {
      setAcceptingId(null);
      toast.error("Couldn't create the person. Try again.");
    },
  });

  const dismiss = (suggestion: PersonSuggestion) => {
    const next = [...dismissed, suggestion.id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Private mode — dismissal lasts for the session only.
    }
  };

  const people = peopleQuery.data ?? [];
  const suggestions = useMemo(
    () => (suggestionsQuery.data ?? []).filter((s) => !dismissed.includes(s.id)),
    [suggestionsQuery.data, dismissed],
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

  return (
    <>
      <PeopleHeader>
        <h1>People</h1>
        <CountLabel>{people.length > 0 ? `${people.length}` : ""}</CountLabel>
      </PeopleHeader>

      {suggestions.length > 0 ? (
        <>
          <SectionTitle>Same person?</SectionTitle>
          <SuggestionList>
            {suggestions.map((suggestion) => {
              const faces = [
                suggestion.coverFaceId,
                ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId),
              ].slice(0, 5);
              return (
                <SuggestionCard key={suggestion.id}>
                  <SuggestionFaces>
                    {faces.map((faceId, index) => (
                      <FaceAvatar
                        key={faceId ?? index}
                        faceId={faceId}
                        size={44}
                        label="Suggested face"
                      />
                    ))}
                  </SuggestionFaces>
                  <SuggestionInfo>
                    <strong>{suggestion.faceCount} faces</strong>
                    <span>These may be the same person. Creating a person groups them.</span>
                  </SuggestionInfo>
                  <SuggestionActions>
                    <Button
                      size="sm"
                      disabled={acceptingId === suggestion.id}
                      onClick={() => accept.mutate(suggestion)}
                    >
                      <UserRoundPlusIcon aria-hidden />
                      {acceptingId === suggestion.id ? "Creating…" : "Create person"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Dismiss suggestion"
                      onClick={() => dismiss(suggestion)}
                    >
                      <XIcon aria-hidden />
                      Not the same
                    </Button>
                  </SuggestionActions>
                </SuggestionCard>
              );
            })}
          </SuggestionList>
        </>
      ) : null}

      {people.length === 0 ? (
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
        <PeopleGrid>
          {people.map((person) => (
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
          ))}
        </PeopleGrid>
      )}
    </>
  );
}
