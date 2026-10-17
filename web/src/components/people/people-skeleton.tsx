import { Skeleton } from "@/components/ui/skeleton";
import { PeopleGrid, PersonTileSkeleton } from "./people.styles";

/** Skeleton twin of the people grid: same columns, tile spacing, 104px circle
 * and name/count lines as `PersonTile`. */
export function PeopleSkeletonGrid({ count }: { count: number }) {
  return (
    <PeopleGrid aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <PersonTileSkeleton key={i}>
          <Skeleton className="size-[6.5rem] rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-[0.8125rem] w-16 motion-reduce:animate-none" />
          <Skeleton className="h-3 w-10 motion-reduce:animate-none" />
        </PersonTileSkeleton>
      ))}
    </PeopleGrid>
  );
}
