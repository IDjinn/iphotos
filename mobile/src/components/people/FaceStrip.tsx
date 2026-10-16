import { ThemedText } from '@/components/ThemedText';
import { FaceAvatar } from '@/components/people/FaceAvatar';
import { ChipPill, Strip, StripItem } from '@/components/people/FaceStrip.styles';

interface FaceStripProps {
  /** Face-crop ids in display order (cover first when the caller has one). */
  faceIds: (string | null)[];
  /** How many faces to render before the overflow chip takes over. */
  max?: number;
  /** Total face count behind the strip — the `+N` chip shows the difference. */
  total?: number;
  /** Intrinsic avatar size in dp (theme-scaled). */
  size?: number;
}

/** Overlapping row of face avatars with a `+N` overflow chip — the review
 * strips on banners and suggestion cards (doc 18 §7.4). */
export function FaceStrip({ faceIds, max = 4, total, size = 40 }: FaceStripProps) {
  const shown = faceIds.slice(0, max);
  const overflow = Math.max(0, (total ?? faceIds.length) - shown.length);

  return (
    <Strip>
      {shown.map((faceId, index) => (
        <StripItem key={`${faceId ?? 'none'}-${index}`} $first={index === 0} $size={size}>
          <FaceAvatar faceId={faceId} size={size} />
        </StripItem>
      ))}
      {overflow > 0 ? (
        <StripItem $first={false} $size={size}>
          <ChipPill $size={size}>
            <ThemedText variant="label" color="secondary">
              +{overflow}
            </ThemedText>
          </ChipPill>
        </StripItem>
      ) : null}
    </Strip>
  );
}
