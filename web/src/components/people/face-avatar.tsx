"use client";

import { UserIcon } from "lucide-react";
import { useFaceCropUrl } from "@/data/blob-cache";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarFallback, AvatarFrame, AvatarImage } from "./face-avatar.styles";

interface FaceAvatarProps {
  /** Face whose crop backs the circle; null renders the fallback icon. */
  faceId: string | null;
  /** Rendered diameter in px (measured by the parent layout). */
  size?: number;
  label?: string;
}

/**
 * Circle avatar backed by an authenticated face crop — person covers, merge
 * chips and review suggestions. A skeleton circle holds the slot while the
 * blob loads; the user icon is only for "no face" or a failed load.
 */
export function FaceAvatar({ faceId, size = 64, label }: FaceAvatarProps) {
  const query = useFaceCropUrl(faceId);
  const url = query.data ?? null;
  const loading = !!faceId && !url && !query.isError;

  return (
    <AvatarFrame $size={size} role="img" aria-label={label ?? "Person"}>
      {url ? (
        <AvatarImage src={url} alt="" width={size} height={size} decoding="async" $visible />
      ) : loading ? (
        <Skeleton className="absolute inset-0 rounded-full motion-reduce:animate-none" />
      ) : (
        <AvatarFallback>
          <UserIcon aria-hidden className="size-1/2" />
        </AvatarFallback>
      )}
    </AvatarFrame>
  );
}
