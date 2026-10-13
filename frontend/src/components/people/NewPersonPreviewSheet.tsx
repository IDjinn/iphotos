import { useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { ActionsRow } from '@/components/people/NewPersonSuggestionCard.styles';
import { ReviewButton } from '@/components/people/ReviewButton';
import { ThemedText } from '@/components/ThemedText';
import type { PersonSuggestion } from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useCloudThumbnailUri, useFaceCropSource } from '@/hooks/use-cloud-file';
import { columnsFor } from '@/theme/scale';
import { useTheme } from '@/theme/context';
import {
  PreviewCell,
  PreviewImage,
  SheetContent,
  TitleBlock,
} from './NewPersonPreviewSheet.styles';

interface NewPersonPreviewSheetProps {
  /** Null hides the sheet; the last suggestion stays rendered while it slides out. */
  suggestion: PersonSuggestion | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (suggestion: PersonSuggestion) => void;
  onDismiss: (suggestion: PersonSuggestion) => void;
}

/**
 * Photo-grid preview behind a "New faces" suggestion (doc 18 §7.4): opens from
 * the card (tap or the review button) so the photos can be checked before
 * creating the person. Sample photos lead; face crops are the fallback when
 * the cluster has none.
 */
export function NewPersonPreviewSheet({
  suggestion,
  busy,
  onClose,
  onCreate,
  onDismiss,
}: NewPersonPreviewSheetProps) {
  const { t, tCount } = useTranslation();
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);

  // Latch the suggestion so the grid doesn't blank mid slide-out animation.
  // Render-phase adjust — the effect-based version trips cascading-render lint.
  const [latched, setLatched] = useState<PersonSuggestion | null>(null);
  const [tracked, setTracked] = useState<PersonSuggestion | null>(null);
  if (suggestion !== tracked) {
    setTracked(suggestion);
    if (suggestion) setLatched(suggestion);
  }
  const shown = suggestion ?? latched;

  const photoIds = shown?.samplePhotoIds ?? [];
  const faces = shown
    ? [...new Set([shown.coverFaceId, ...shown.faceIds])].filter(
        (id): id is string => id !== null,
      )
    : [];
  const showPhotos = photoIds.length > 0;
  const cells = showPhotos ? photoIds : faces;

  return (
    <BottomSheet visible={suggestion !== null} onClose={onClose} maxHeightFactor={0.85}>
      {shown ? (
        <SheetContent>
          <TitleBlock>
            <ThemedText variant="titleMedium">{t('people.newFaces')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {tCount('people.suggestionFacesCount', shown.faceCount, { count: shown.faceCount })} ·{' '}
              {t('people.mayBeSamePerson')}
            </ThemedText>
          </TitleBlock>
          <FlatList
            key={columns}
            numColumns={columns}
            data={cells}
            keyExtractor={(id) => id}
            renderItem={({ item }) =>
              showPhotos ? <PhotoCell photoId={item} /> : <FaceCell faceId={item} />
            }
            columnWrapperStyle={{ gap: space[2] }}
            contentContainerStyle={{ gap: space[2], paddingBottom: space[2] }}
          />
          <ActionsRow>
            <ReviewButton
              icon="person-add-outline"
              label={t('people.createPerson')}
              busyLabel={t('people.creating')}
              busy={busy}
              onPress={() => onCreate(shown)}
            />
            <ReviewButton
              variant="ghost"
              label={t('suggestion.notNow')}
              disabled={busy}
              onPress={() => onDismiss(shown)}
            />
          </ActionsRow>
        </SheetContent>
      ) : null}
    </BottomSheet>
  );
}

function PhotoCell({ photoId }: { photoId: string }) {
  const source = useCloudThumbnailUri(photoId);
  return (
    <PreviewCell>
      {source ? <PreviewImage source={source} contentFit="cover" recyclingKey={photoId} /> : null}
    </PreviewCell>
  );
}

function FaceCell({ faceId }: { faceId: string }) {
  const source = useFaceCropSource(faceId);
  return (
    <PreviewCell>
      {source ? <PreviewImage source={source} contentFit="cover" recyclingKey={faceId} /> : null}
    </PreviewCell>
  );
}
