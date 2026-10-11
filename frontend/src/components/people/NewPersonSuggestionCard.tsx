import Animated, { FadeIn } from 'react-native-reanimated';

import { useTranslation } from '@/i18n/hook';
import { ReviewButton } from '@/components/people/ReviewButton';
import { FaceStrip } from '@/components/people/FaceStrip';
import {
  ActionsRow,
  Card,
  Info,
  Subtitle,
  Title,
  TopRow,
} from '@/components/people/NewPersonSuggestionCard.styles';
import type { PersonSuggestion } from '@/data/people-repository';

interface NewPersonSuggestionCardProps {
  suggestion: PersonSuggestion;
  busy: boolean;
  onCreate: (suggestion: PersonSuggestion) => void;
  onDismiss: (suggestion: PersonSuggestion) => void;
}

/** "New faces" card on the people hub (doc 18 §7.4, web parity): a cluster of
 * unassigned faces that match no existing person — create the person or
 * dismiss. Cover face leads the strip. */
export function NewPersonSuggestionCard({
  suggestion,
  busy,
  onCreate,
  onDismiss,
}: NewPersonSuggestionCardProps) {
  const { t, tCount } = useTranslation();
  const faces = [suggestion.coverFaceId, ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId)];

  return (
    <Card entering={FadeIn.duration(200)}>
      <TopRow>
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
      </TopRow>
      <ActionsRow>
        <ReviewButton
          icon="person-add-outline"
          label={t('people.createPerson')}
          busyLabel={t('people.creating')}
          busy={busy}
          onPress={() => onCreate(suggestion)}
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
