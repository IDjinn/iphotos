"use client";

import { UserIcon } from "lucide-react";
import { useFaceCropUrl } from "@/data/blob-cache";
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
 * chips and review suggestions. Skeleton circle while the blob loads, then the
 * image fades in (opacity-only; reduced motion renders a static placeholder).
 */
export function FaceAvatar({ faceId, size = 64, label }: FaceAvatarProps) {
  const query = useFaceCropUrl(faceId);
  const url = query.data ?? null;

  return (
    <AvatarFrame $size={size} role="img" aria-label={label ?? "Person"}>
      {url ? (
        <AvatarImage src={url} alt="" $visible />
      ) : (
        <AvatarFallback>
          <UserIcon aria-hidden className="size-1/2" />
        </AvatarFallback>
      )}
    </AvatarFrame>
  );
}
