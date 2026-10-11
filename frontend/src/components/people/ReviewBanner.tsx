import Animated, { FadeIn } from 'react-native-reanimated';

import { useTranslation } from '@/i18n/hook';
import { ReviewButton } from '@/components/people/ReviewButton';
import { FaceStrip } from '@/components/people/FaceStrip';
import {
  ActionsRow,
  Banner,
  Info,
  Subtitle,
  Title,
  TopRow,
} from '@/components/people/ReviewBanner.styles';

interface ReviewBannerProps {
  /** Face-crop ids for the strip (cover first). */
  faces: (string | null)[];
  /** Total faces behind the strip — renders the `+N` chip when larger. */
  total?: number;
  title: string;
  subtitle?: string;
  reviewLabel: string;
  primaryLabel: string;
  primaryBusyLabel?: string;
  /** Any review action is in flight — every button disables. */
  busy?: boolean;
  onReview: () => void;
  onPrimary: () => void;
  /** "Not now" — dismisses the suggestion for good (persisted). */
  onDismiss: () => void;
}

/** The "same person?" review banner above the person's photo grid (doc 18
 * §7.4, web parity): face strip + copy + Review / primary action / Not now.
 * The three banner variants (faces, group target, group member) only differ
 * in copy and handlers, so the screen composes those and this stays dumb. */
export function ReviewBanner({
  faces,
  total,
  title,
  subtitle,
  reviewLabel,
  primaryLabel,
  primaryBusyLabel,
  busy = false,
  onReview,
  onPrimary,
  onDismiss,
}: ReviewBannerProps) {
  const { t } = useTranslation();

  return (
    <Banner entering={FadeIn.duration(200)}>
      <TopRow>
        <FaceStrip faceIds={faces} total={total} />
        <Info>
          <Title variant="body" numberOfLines={2}>
            {title}
          </Title>
          {subtitle ? (
            <Subtitle variant="bodySmall" color="secondary" numberOfLines={2}>
              {subtitle}
            </Subtitle>
          ) : null}
        </Info>
      </TopRow>
      <ActionsRow>
        <ReviewButton variant="outline" label={reviewLabel} disabled={busy} onPress={onReview} />
        <ReviewButton
          label={primaryLabel}
          busyLabel={primaryBusyLabel}
          busy={busy}
          onPress={onPrimary}
        />
        <ReviewButton label={t('suggestion.notNow')} disabled={busy} onPress={onDismiss} />
      </ActionsRow>
    </Banner>
  );
}
