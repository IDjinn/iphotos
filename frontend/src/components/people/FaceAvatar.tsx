import { Icon } from '@/components/Icon';
import { useTranslation } from '@/i18n/hook';
import { useFaceCropSource } from '@/hooks/use-cloud-file';
import { useTheme } from '@/theme/context';

import { Circle, FaceImage } from '@/components/people/FaceAvatar.styles';

interface FaceAvatarProps {
  /** Face-crop id; null renders the person-glyph placeholder permanently. */
  faceId: string | null;
  /** Intrinsic dp size, scaled by the theme factor. */
  size: number;
  /** Accessibility label (person name or role of the face in the review). */
  label?: string;
}

/** Circular face crop with a neutral placeholder — the avatar everywhere in
 * the people review UI (strips, banners, stepper figures). */
export function FaceAvatar({ faceId, size, label }: FaceAvatarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const source = useFaceCropSource(faceId);

  return (
    <Circle
      $size={size}
      accessibilityLabel={label ?? t('people.unnamed')}
      accessibilityRole="image"
    >
      {source ? (
        <FaceImage
          source={source}
          contentFit="cover"
          recyclingKey={faceId ?? undefined}
          accessibilityLabel={label}
        />
      ) : (
        <Icon name="person" size={Math.round(size / 2)} color={colors.textSecondary} />
      )}
    </Circle>
  );
}
