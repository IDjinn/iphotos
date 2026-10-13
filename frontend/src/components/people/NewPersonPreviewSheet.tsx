import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/skeleton/Skeleton';
import { ActionsRow } from '@/components/people/NewPersonSuggestionCard.styles';
import { ReviewButton } from '@/components/people/ReviewButton';
import { ThemedText } from '@/components/ThemedText';
import { ApiError } from '@/data/api-client';
import type { CloudPhoto } from '@/data/cloud-photos-repository';
import {
  faceCropSource,
  listPeoplePage,
  listSuggestionPhotos,
  type Person,
  type PersonSuggestion,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useCloudThumbnailUri } from '@/hooks/use-cloud-file';
import { columnsFor } from '@/theme/scale';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import {
  NoticeArea,
  NoticeInline,
  NoticeRow,
  PersonAvatar,
  PersonAvatarFallback,
  PersonMeta,
  PersonRow,
  PickerHeader,
  PickerHeaderSpacer,
  PickerList,
  PickerTitle,
  PreviewCell,
  PreviewImage,
  PhotoGrid,
  SearchInput,
  SheetContent,
  SkeletonCell,
  SkeletonFooter,
  SkeletonGrid,
  SkeletonListRow,
  SkeletonRow,
  TitleBlock,
} from './NewPersonPreviewSheet.styles';

const PAGE_SIZE = 60;
const PICKER_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const SKELETON_ROWS = 3;

interface NewPersonPreviewSheetProps {
  /** Null hides the sheet; the last suggestion stays rendered while it slides out. */
  suggestion: PersonSuggestion | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (suggestion: PersonSuggestion) => void;
  /** Folds the whole cluster into an existing person the AI failed to match. */
  onAssign: (suggestion: PersonSuggestion, person: Person) => void;
  onDismiss: (suggestion: PersonSuggestion) => void;
  /** The cluster vanished server-side (accepted/merged/reassigned elsewhere) —
   * the parent closes the sheet and refreshes the queue. */
  onGone: (suggestion: PersonSuggestion) => void;
}

/**
 * Photo-grid preview behind a "New faces" suggestion (doc 18 §7.4): opens from
 * the card (tap or the review button) so the photos can be checked before
 * deciding. Photos page in with infinite scroll (skeletons while loading) and
 * the actions create the person, fold the cluster into an existing one, or
 * pass for now.
 */
export function NewPersonPreviewSheet({
  suggestion,
  busy,
  onClose,
  onCreate,
  onAssign,
  onDismiss,
  onGone,
}: NewPersonPreviewSheetProps) {
  const { t, tCount } = useTranslation();
  const { space, colors } = useTheme();
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);

  // Latch the suggestion so the grid doesn't blank mid slide-out animation,
  // resetting the paged grid and the picker for every new cluster. Render-phase
  // adjust — the effect-based version trips cascading-render lint.
  const [latched, setLatched] = useState<PersonSuggestion | null>(null);
  const [tracked, setTracked] = useState<PersonSuggestion | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [photos, setPhotos] = useState<CloudPhoto[] | null>(null);
  const [photosTotal, setPhotosTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [loadingMorePeople, setLoadingMorePeople] = useState(false);
  const [term, setTerm] = useState('');
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  if (suggestion !== tracked) {
    setTracked(suggestion);
    if (suggestion) {
      setLatched(suggestion);
      setPhotos(null);
      setPhotosTotal(0);
      setLoadingMore(false);
      setMoreFailed(false);
      setFailed(false);
      setAttempt((current) => current + 1);
      setPicking(false);
      setPeople(null);
      setPeopleTotal(0);
      setLoadingMorePeople(false);
      setTerm('');
      setPendingPersonId(null);
    }
  }
  const shown = suggestion ?? latched;

  // First page of the cluster's photos; a 404 means the cluster ceased to
  // exist (accepted, merged or reassigned elsewhere) — hand it to the parent.
  useEffect(() => {
    if (!shown) return;
    let alive = true;
    listSuggestionPhotos(shown.id, 1, PAGE_SIZE)
      .then((result) => {
        if (!alive) return;
        setPhotos(result.items);
        setPhotosTotal(result.totalCount);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (error instanceof ApiError && error.status === 404) {
          onGone(shown);
          return;
        }
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [shown, attempt, onGone]);

  const retry = () => {
    setFailed(false);
    setAttempt((current) => current + 1);
  };

  const loadMorePhotos = () => {
    if (!shown || photos === null || loadingMore || photos.length >= photosTotal) return;
    setLoadingMore(true);
    setMoreFailed(false);
    listSuggestionPhotos(shown.id, Math.floor(photos.length / PAGE_SIZE) + 1, PAGE_SIZE)
      .then((result) => {
        setPhotos((current) => {
          if (current === null) return result.items;
          const seen = new Set(current.map((photo) => photo.id));
          return [...current, ...result.items.filter((photo) => !seen.has(photo.id))];
        });
      })
      .catch(() => setMoreFailed(true))
      .finally(() => setLoadingMore(false));
  };

  const loadPeople = async (appliedTerm: string, page: number) => {
    if (page === 1) {
      setPeople(null);
      setPeopleTotal(0);
    } else {
      setLoadingMorePeople(true);
    }

    try {
      const result = await listPeoplePage(page, PICKER_PAGE_SIZE, appliedTerm ? { name: appliedTerm } : {});
      setPeople((current) => {
        if (page === 1 || current === null) return result.items;
        const seen = new Set(current.map((person) => person.id));
        return [...current, ...result.items.filter((person) => !seen.has(person.id))];
      });
      setPeopleTotal(result.totalCount);
    } catch {
      // Additive list — an empty picker beats an error wall (queue convention).
      if (page === 1) setPeople([]);
    } finally {
      setLoadingMorePeople(false);
    }
  };

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const onSearch = (text: string) => {
    setTerm(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadPeople(text, 1), SEARCH_DEBOUNCE_MS);
  };

  const loadMorePeople = () => {
    if (people === null || loadingMorePeople || people.length >= peopleTotal) return;
    void loadPeople(term, Math.floor(people.length / PICKER_PAGE_SIZE) + 1);
  };

  const openPicker = () => {
    haptic('light');
    setPicking(true);
    if (people === null) void loadPeople(term, 1);
  };

  const assign = (person: Person) => {
    if (!shown || busy) return;
    setPendingPersonId(person.id);
    onAssign(shown, person);
  };

  return (
    <BottomSheet visible={suggestion !== null} onClose={onClose} maxHeightFactor={0.85} fixedHeight>
      {shown ? (
        <SheetContent>
          {picking ? (
            <>
              <PickerHeader>
                <Pressable
                  hitSlop={12}
                  onPress={() => setPicking(false)}
                  accessibilityLabel={t('common.back')}
                >
                  <Icon name="arrow-back" size={24} />
                </Pressable>
                <PickerTitle variant="titleMedium" numberOfLines={1}>
                  {t('people.addToPerson')}
                </PickerTitle>
                <PickerHeaderSpacer />
              </PickerHeader>
              <SearchInput
                placeholder={t('people.searchPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                onChangeText={onSearch}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <PickerList
                data={people ?? []}
                keyExtractor={(person) => person.id}
                renderItem={({ item }) => (
                  <PersonRowItem
                    person={item}
                    busy={busy && pendingPersonId === item.id}
                    disabled={busy}
                    onPress={() => assign(item)}
                  />
                )}
                ListEmptyComponent={
                  people === null ? (
                    <PickerSkeleton />
                  ) : (
                    <NoticeInline>
                      <ThemedText variant="bodySmall" color="secondary">
                        {t('people.pickPersonEmpty')}
                      </ThemedText>
                    </NoticeInline>
                  )
                }
                onEndReached={loadMorePeople}
                onEndReachedThreshold={0.5}
                contentContainerStyle={{ paddingBottom: space[2] }}
              />
            </>
          ) : (
            <>
              <TitleBlock>
                <ThemedText variant="titleMedium">{t('people.newFaces')}</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {tCount('people.suggestionFacesCount', shown.faceCount, { count: shown.faceCount })} ·{' '}
                  {t('people.mayBeSamePerson')}
                </ThemedText>
              </TitleBlock>
              {photos === null ? (
                failed ? (
                  <NoticeArea>
                    <RetryNotice onPress={retry} />
                  </NoticeArea>
                ) : (
                  <GridSkeleton columns={columns} />
                )
              ) : (
                <PhotoGrid
                  key={columns}
                  numColumns={columns}
                  data={photos}
                  keyExtractor={(photo) => photo.id}
                  renderItem={({ item }) => <PhotoCell photoId={item.id} />}
                  columnWrapperStyle={{ gap: space[2] }}
                  contentContainerStyle={{ gap: space[2], paddingBottom: space[2] }}
                  onEndReached={loadMorePhotos}
                  onEndReachedThreshold={0.5}
                  ListEmptyComponent={
                    <NoticeInline>
                      <ThemedText variant="bodySmall" color="secondary">
                        {t('people.previewNoPhotos')}
                      </ThemedText>
                    </NoticeInline>
                  }
                  ListFooterComponent={
                    loadingMore ? (
                      <SkeletonFooter>
                        <SkeletonRow>
                          {Array.from({ length: columns }, (_, index) => (
                            <SkeletonCell key={index}>
                              <Skeleton fill radius="md" />
                            </SkeletonCell>
                          ))}
                        </SkeletonRow>
                      </SkeletonFooter>
                    ) : moreFailed ? (
                      <NoticeArea>
                        <RetryNotice onPress={loadMorePhotos} />
                      </NoticeArea>
                    ) : null
                  }
                />
              )}
              <ActionsRow>
                <ReviewButton
                  icon="person-add-outline"
                  label={t('people.createPerson')}
                  busyLabel={t('people.creating')}
                  busy={busy}
                  onPress={() => onCreate(shown)}
                />
                <ReviewButton
                  variant="outline"
                  icon="person-circle-outline"
                  label={t('people.addToPerson')}
                  disabled={busy}
                  onPress={openPicker}
                />
                <ReviewButton
                  variant="ghost"
                  label={t('suggestion.notNow')}
                  disabled={busy}
                  onPress={() => onDismiss(shown)}
                />
              </ActionsRow>
            </>
          )}
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

/** Skeleton twin of the photo grid, shown while the first page loads. */
function GridSkeleton({ columns }: { columns: number }) {
  return (
    <SkeletonGrid>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <SkeletonRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <SkeletonCell key={column}>
              <Skeleton fill radius="md" />
            </SkeletonCell>
          ))}
        </SkeletonRow>
      ))}
    </SkeletonGrid>
  );
}

/** Skeleton twin of the picker rows (circle + two copy lines). */
function PickerSkeleton() {
  const { ms } = useTheme();
  return (
    <>
      {Array.from({ length: 5 }, (_, row) => (
        <SkeletonListRow key={row}>
          <Skeleton width={ms(44)} height={ms(44)} radius="full" />
          <PersonMeta>
            <Skeleton width="60%" height={ms(14)} radius="sm" />
            <Skeleton width="30%" height={ms(12)} radius="sm" />
          </PersonMeta>
        </SkeletonListRow>
      ))}
    </>
  );
}

/** Load-failed notice that doubles as the retry affordance. */
function RetryNotice({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <NoticeRow
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('people.previewLoadFailed')}
    >
      <Icon name="cloud-offline-outline" size={16} color={colors.textSecondary} />
      <ThemedText variant="bodySmall" color="secondary">
        {t('people.previewLoadFailed')}
      </ThemedText>
    </NoticeRow>
  );
}

function PersonRowItem({
  person,
  busy: rowBusy,
  disabled,
  onPress,
}: {
  person: Person;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t, tCount } = useTranslation();
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const source = faceCropSource(person.coverFaceId ?? '');
  return (
    <PersonRow
      $pressed={pressed}
      disabled={disabled || rowBusy}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={person.name ?? t('people.unnamed')}
    >
      {source ? (
        <PersonAvatar source={source} contentFit="contain" recyclingKey={person.id} />
      ) : (
        <PersonAvatarFallback>
          <Icon name="person-outline" size={20} color={colors.textSecondary} />
        </PersonAvatarFallback>
      )}
      <PersonMeta>
        <ThemedText variant="body" numberOfLines={1}>
          {person.name ?? t('people.unnamed')}
        </ThemedText>
        <ThemedText variant="bodySmall" color="secondary">
          {tCount('people.suggestionFacesCount', person.faceCount, { count: person.faceCount })}
        </ThemedText>
      </PersonMeta>
      {rowBusy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
      )}
    </PersonRow>
  );
}
