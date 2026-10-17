"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { listPeoplePage, type Person } from "@/data/people-repository";
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
import { PickerList, PickerRow, PickerRowText } from "./person-picker-dialog.styles";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface PersonPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many faces are about to be added (confirm button label). */
  faceCount: number;
  busy: boolean;
  onConfirm: (person: Person) => void;
}

/**
 * Picks an existing person to fold a suggestion into (instead of creating a
 * duplicate — typically old photos vs new ones of the same face). Search by
 * name, paged like the people list; nothing is merged until the explicit
 * confirm.
 */
export function PersonPickerDialog({
  open,
  onOpenChange,
  faceCount,
  busy,
  onConfirm,
}: PersonPickerDialogProps) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setName(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: ["people", "picker", name],
    queryFn: ({ pageParam }) =>
      listPeoplePage(pageParam, PAGE_SIZE, { name: name || undefined }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: open,
  });
  const people = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to an existing person</DialogTitle>
          <DialogDescription>
            Pick who these faces belong to. They join that person instead of creating a
            duplicate.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by name"
          aria-label="Search people by name"
        />

        <PickerList aria-busy={query.isPending}>
          {query.isPending ? (
            Array.from({ length: 6 }, (_, i) => (
              <PickerRow key={i} as="div" aria-hidden="true">
                <Skeleton className="size-10 rounded-full motion-reduce:animate-none" />
                <Skeleton className="h-4 w-32 motion-reduce:animate-none" />
              </PickerRow>
            ))
          ) : query.isError ? (
            <p role="alert">Couldn&apos;t load people. Try again.</p>
          ) : people.length === 0 ? (
            <p>No people match your search.</p>
          ) : (
            people.map((person) => (
              <PickerRow
                key={person.id}
                type="button"
                $selected={selected?.id === person.id}
                onClick={() => setSelected(person)}
                aria-pressed={selected?.id === person.id}
              >
                <FaceAvatar
                  faceId={person.coverFaceId}
                  size={40}
                  label={person.name ?? "Unnamed"}
                />
                <PickerRowText>
                  <strong>{person.name ?? "Unnamed"}</strong>
                  <span>
                    {person.faceCount} {person.faceCount === 1 ? "face" : "faces"}
                  </span>
                </PickerRowText>
                {selected?.id === person.id ? <CheckIcon aria-hidden className="size-4" /> : null}
              </PickerRow>
            ))
          )}
          {query.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </PickerList>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={!selected || busy} onClick={() => selected && onConfirm(selected)}>
            {busy
              ? "Adding…"
              : selected
                ? `Add ${faceCount} ${faceCount === 1 ? "face" : "faces"} to ${selected.name ?? "Unnamed"}`
                : "Pick a person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
