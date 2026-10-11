import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import { NewPersonSuggestionCard } from '@/components/people/NewPersonSuggestionCard';
import {
  Center,
  Header,
  HeaderSpacer,
  HeaderTitle,
  ListArea,
  NewFacesSection,
  PersonBadgeDot,
  PersonCard,
  PersonCardAvatar,
  PersonCardImage,
  PersonCount,
  PersonGroupLine,
  PersonName,
  RetryButton,
  Screen,
  SectionTitle,
  SkeletonCard,
  SkeletonGrid,
} from '@/screens/people.styles';
import {
  acceptPersonSuggestion,
  listPeoplePage,
  listPersonSuggestions,
  type Person,
  type PersonSuggestions,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useFaceCropSource } from '@/hooks/use-cloud-file';
import { useSuggestionDismissalsStore } from '@/stores/suggestion-dismissals';
import { columnsFor } from '@/theme/scale';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const PAGE_SIZE = 60;

/**
 * All detected people (doc 18 §10) — reached from the Search tab's People row.
 * Paged card grid (named first) plus the §7.4 review surfaces: "New faces"
 * cards here and pending-review dots on tiles involved in a suggestion.
 */
export default function PeopleScreen() {
  const { colors, space } = useTheme();
  const { t, tCount } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);

  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextPage = useRef(2);
  const [suggestions, setSuggestions] = useState<PersonSuggestions | null>(null);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);
  const dismiss = useSuggestionDismissalsStore((s) => s.dismiss);

  const load = useCallback(async (mode: 'initial' | 'silent' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const [page, queue] = await Promise.all([listPeoplePage(1, PAGE_SIZE), listPersonSuggestions()]);
      nextPage.current = 2;
      setPeople(page.items);
      setHasMore(page.items.length < page.totalCount);
      setSuggestions(queue);
    } catch (err) {
      if (mode !== 'silent') setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mode === 'refresh') setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listPeoplePage(nextPage.current, PAGE_SIZE);
      nextPage.current += 1;
      setHasMore(page.items.length < page.totalCount);
      setPeople((current) => {
        if (!current) return page.items;
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...page.items.filter((p) => !seen.has(p.id))];
      });
    } catch {
      // Keep the loaded pages; the next scroll attempt retries.
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Renames/merges/reviews happen on the person screen — reload on every focus.
  useFocusEffect(
    useCallback(() => {
      void load('silent');
    }, [load]),
  );

  const createPerson = async (suggestion: { id: string; faceIds: string[] }) => {
    setBusySuggestionId(suggestion.id);
    try {
      const person = await acceptPersonSuggestion(suggestion.faceIds);
      haptic('success');
      setToast(t('people.personCreated'));
      router.push(`/person/${person.id}`);
      void load('silent');
    } catch {
      setToast(t('people.createFailed'));
    } finally {
      setBusySuggestionId(null);
    }
  };

  const newPeople = (suggestions?.newPeople ?? []).filter((s) => !dismissed.includes(s.id));
  const activeGroups = (suggestions?.personMergeGroups ?? []).filter(
    (group) => !dismissed.includes(group.id),
  );
  // Review dot: every person involved in a live face-merge or group suggestion.
  const pendingIds = new Set<string>();
  (suggestions?.merges ?? []).forEach((merge) => {
    if (!dismissed.includes(merge.id)) pendingIds.add(merge.personId);
  });
  const groupCounts = new Map<string, number>();
  activeGroups.forEach((group) => {
    pendingIds.add(group.target.personId);
    groupCounts.set(group.target.personId, group.members.length);
    group.members.forEach((member) => pendingIds.add(member.personId));
  });

  const showSkeleton = people === null && !error;
  const showEmpty =
    !showSkeleton && !error && (people?.length ?? 0) === 0 && newPeople.length === 0;

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      {showSkeleton ? (
        <SkeletonGrid>
          {Array.from({ length: 9 }, (_, index) => (
            <SkeletonCard key={index} />
          ))}
        </SkeletonGrid>
      ) : error ? (
        <Center $insetTop={0}>
          <ThemedText variant="bodySmall" color="danger">
            {error}
          </ThemedText>
          <RetryButton onPress={() => void load('initial')}>
            <ThemedText variant="bodySmall" color="accent">
              {t('common.retry')}
            </ThemedText>
          </RetryButton>
        </Center>
      ) : showEmpty ? (
        <Center $insetTop={0}>
          <EmptyState icon="people-outline" title={t('people.emptyTitle')} subtitle={t('people.emptySubtitle')} />
        </Center>
      ) : (
        <ListArea>
          <FlatList<Person>
            key={columns}
            numColumns={columns}
            data={people ?? []}
            renderItem={({ item }) => (
              <PersonCardItem
                person={item}
                pending={pendingIds.has(item.id)}
                groupCount={groupCounts.get(item.id) ?? 0}
              />
            )}
            ListHeaderComponent={
              newPeople.length > 0 ? (
                <NewFacesSection>
                  <SectionTitle variant="label" color="secondary">
                    {t('people.newFaces')}
                  </SectionTitle>
                  {newPeople.map((suggestion) => (
                    <NewPersonSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      busy={busySuggestionId === suggestion.id}
                      onCreate={(candidate) => void createPerson(candidate)}
                      onDismiss={(candidate) => dismiss(candidate.id)}
                    />
                  ))}
                </NewFacesSection>
              ) : null
            }
            ListFooterComponent={loadingMore ? <ListSpinner /> : null}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.6}
            contentContainerStyle={{
              paddingHorizontal: space[3],
              gap: space[3],
              paddingBottom: insets.bottom + space[3],
            }}
            columnWrapperStyle={{ gap: space[3] }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load('refresh')}
                tintColor={colors.textSecondary}
                progressBackgroundColor={colors.surface}
              />
            }
          />
        </ListArea>
      )}

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

function ListSpinner() {
  const { colors } = useTheme();
  return (
    <Center $insetTop={0}>
      <ActivityIndicator size="small" color={colors.accent} />
    </Center>
  );
}

/** People-grid card: cover from the persistent face-crop cache, name + count,
 * a review dot when a suggestion involves this person and, for a merge-group
 * target, the "+N groups · review" line. */
function PersonCardItem({
  person,
  pending,
  groupCount,
}: {
  person: Person;
  pending: boolean;
  groupCount: number;
}) {
  const { t, tCount } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const cover = useFaceCropSource(person.coverFaceId);

  return (
    <PersonCard
      onPress={() => {
        haptic('light');
        router.push(`/person/${person.id}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={person.name ?? t('people.unnamed')}
    >
      {pending ? <PersonBadgeDot /> : null}
      <PersonCardAvatar>
        {cover ? (
          <PersonCardImage source={cover} contentFit="cover" recyclingKey={person.id} />
        ) : (
          <Icon name="person" size={28} color={colors.textSecondary} />
        )}
      </PersonCardAvatar>
      <PersonName variant="bodySmall" numberOfLines={1}>
        {person.name ?? t('people.unnamed')}
      </PersonName>
      <PersonCount variant="bodySmall" color="secondary" numberOfLines={1}>
        {tCount('people.photosCount', person.faceCount, { count: person.faceCount })}
      </PersonCount>
      {groupCount > 0 ? (
        <PersonGroupLine variant="bodySmall" color="accent" numberOfLines={1}>
          {tCount('people.groupReviewCount', groupCount, { count: groupCount })}
        </PersonGroupLine>
      ) : null}
    </PersonCard>
  );
}
