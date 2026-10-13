import { FadeIn } from 'react-native-reanimated';

import { useTranslation } from '@/i18n/hook';
import { ReviewButton } from '@/components/people/ReviewButton';
import { FaceStrip } from '@/components/people/FaceStrip';
import {
  ActionsRow,
  Card,
  Info,
  PreviewPressable,
  Subtitle,
  Title,
} from '@/components/people/NewPersonSuggestionCard.styles';
import type { PersonSuggestion } from '@/data/people-repository';

interface NewPersonSuggestionCardProps {
  suggestion: PersonSuggestion;
  busy: boolean;
  onCreate: (suggestion: PersonSuggestion) => void;
  onDismiss: (suggestion: PersonSuggestion) => void;
  /** Opens the photo-grid preview sheet (card tap and the review button). */
  onPreview: (suggestion: PersonSuggestion) => void;
}

/** "New faces" card on the people hub (doc 18 §7.4, web parity): a cluster of
 * unassigned faces that match no existing person — preview the photos, create
 * the person or dismiss. Cover face leads the strip. */
export function NewPersonSuggestionCard({
  suggestion,
  busy,
  onCreate,
  onDismiss,
  onPreview,
}: NewPersonSuggestionCardProps) {
  const { t, tCount } = useTranslation();
  const faces = [suggestion.coverFaceId, ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId)];

  return (
    <Card entering={FadeIn.duration(200)}>
      <PreviewPressable
        onPress={() => onPreview(suggestion)}
        accessibilityRole="button"
        accessibilityLabel={tCount('people.previewFacesA11y', suggestion.faceCount, {
          count: suggestion.faceCount,
        })}
      >
        <FaceStrip faceIds={faces} total={suggestion.faceCount} />
        <Info>
          <Title variant="body">
            {tCount('people.suggestionFacesCount', suggestion.faceCount, {
              count: suggestion.faceCount,
            })}
          </Title>
          <Subtitle variant="bodySmall" color="secondary" numberOfLines={2}>
            {t('people.mayBeSamePerson')}
          </Subtitle>
        </Info>
      </PreviewPressable>
      <ActionsRow>
        <ReviewButton
          icon="person-add-outline"
          label={t('people.createPerson')}
          busyLabel={t('people.creating')}
          busy={busy}
          onPress={() => onCreate(suggestion)}
        />
        <ReviewButton
          variant="outline"
          icon="eye-outline"
          label={t('people.reviewFaces')}
          disabled={busy}
          onPress={() => onPreview(suggestion)}
        />
        <ReviewButton
          variant="ghost"
          label={t('suggestion.notNow')}
          disabled={busy}
          onPress={() => onDismiss(suggestion)}
        />
      </ActionsRow>
    </Card>
  );
}
