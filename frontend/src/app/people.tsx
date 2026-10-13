import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PromptDialog } from '@/components/PromptDialog';
import { CyclingFaceStrip } from '@/components/people/CyclingFaceStrip';
import { Skeleton } from '@/components/skeleton/Skeleton';
import { SkeletonPeopleGrid } from '@/components/skeleton/SkeletonPeopleGrid';
import { ThemedText } from '@/components/ThemedText';
import {
  Center,
  FilterChip,
  FilterChipLabel,
  FilterRow,
  Header,
  HeaderSpacer,
  HeaderTitle,
  ListArea,
  LoadingStrip,
  LoadingStripItem,
  PersonBadgeDot,
  PersonCard,
  PersonCardAvatar,
  PersonCardImage,
  PersonCount,
  PersonGroupLine,
  PersonName,
  ResultCount,
  RetryButton,
  ReviewSuggestionsButton,
  ReviewSuggestionsLabel,
  Screen,
  SearchBar,
  SearchInput,
  Toolbar,
} from '@/screens/people.styles';
import {
  listPeoplePage,
  listPersonSuggestions,
  renamePerson,
  type PeopleFilter,
  type Person,
  type PersonSuggestions,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useFaceCropSource } from '@/hooks/use-cloud-file';
import { useSuggestionDismissalsStore } from '@/stores/suggestion-dismissals';
import { columnsFor } from '@/theme/scale';
import { useTheme } from '@/theme/context';
import { Durations } from '@/theme/tokens';
import { haptic } from '@/utils/haptics';

const PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 260;

/** Named-status filter behind the `isNamed` query param (doc 18 §9). */
type NamedFilter = 'all' | 'named' | 'unnamed';

const FILTER_CHIPS = [
  { key: 'all', labelKey: 'people.filterAll' },
  { key: 'named', labelKey: 'people.filterNamed' },
  { key: 'unnamed', labelKey: 'people.filterUnnamed' },
] as const;

/**
 * All detected people (doc 18 §10) — reached from the Search tab's People row.
 * Infinite-scroll card grid (named first) over the server-paged endpoint, with
 * name search + All/Named/Unnamed chips pushed down as `?name=`/`?isNamed=`,
 * plus the §7.4 review surfaces: "New faces" cards (tap to preview the photos
 * before creating) and pending-review dots on tiles involved in a suggestion.
 */
export default function PeopleScreen() {
  const { colors, space, ms } = useTheme();
  const { t, tCount } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);

  const [people, setPeople] = useState<Person[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [namedFilter, setNamedFilter] = useState<NamedFilter>('all');
  const [query, setQuery] = useState('');
  /** Remounts the search bar (clearing its local text) from "Clear filters". */
  const [searchResetKey, setSearchResetKey] = useState(0);

  const [suggestions, setSuggestions] = useState<PersonSuggestions | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Long-press rename: the person being renamed (drives the prompt dialog). */
  const [renaming, setRenaming] = useState<Person | null>(null);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);

  const nextPage = useRef(2);
  // Bumped by every page-1 (window) load; in-flight loads compare and drop
  // themselves when a newer window superseded them.
  const windowSeq = useRef(0);
  const hasContent = useRef(false);
  const firstWindow = useRef(true);
  // Latest window params for callbacks that must stay referentially stable
  // (useFocusEffect would re-fire on every identity change).
  const filterRef = useRef<PeopleFilter>({});

  const filter: PeopleFilter = useMemo(
    () => ({
      name: query.trim() || undefined,
      isNamed: namedFilter === 'all' ? undefined : namedFilter === 'named',
    }),
    [namedFilter, query],
  );
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);
  const hasWindow = namedFilter !== 'all' || query.trim().length > 0;

  const loadPage1 = useCallback(async (mode: 'initial' | 'silent' | 'refresh', f: PeopleFilter) => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'initial') setError(null);
    const seq = ++windowSeq.current;
    try {
      const page = await listPeoplePage(1, PAGE_SIZE, f);
      if (seq !== windowSeq.current) return;
      hasContent.current = true;
      nextPage.current = 2;
      setPeople(page.items);
      setTotalCount(page.totalCount);
      setHasMore(page.items.length < page.totalCount);
    } catch (err) {
      if (seq !== windowSeq.current) return;
      // Surface the error only when there is nothing on screen to keep.
      if (mode !== 'silent' || !hasContent.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mode === 'refresh') setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const seq = windowSeq.current;
    try {
      const page = await listPeoplePage(nextPage.current, PAGE_SIZE, filterRef.current);
      if (seq !== windowSeq.current) return;
      nextPage.current += 1;
      setTotalCount(page.totalCount);
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

  // Deliberately separate from the people window: the suggestions endpoint is
  // the slow half, and the grid must not wait on it to paint.
  const loadSuggestions = useCallback(async () => {
    try {
      setSuggestions(await listPersonSuggestions());
    } catch {
      // Review surfaces are additive — the grid stays when they fail.
    }
  }, []);

  // Focus fires on mount too — the single cold-load entry point (no double
  // fetch of page 1), plus a silent refresh after renames/merges/reviews.
  useFocusEffect(
    useCallback(() => {
      void loadPage1('silent', filterRef.current);
      void loadSuggestions();
    }, [loadPage1, loadSuggestions]),
  );

  // Search/filter window change: keep the previous grid on screen (the paged
  // endpoint answers fast) and swap in the new window when it arrives.
  useEffect(() => {
    if (firstWindow.current) {
      firstWindow.current = false;
      return;
    }
    void loadPage1('silent', filter);
  }, [filter, loadPage1]);

  const refresh = useCallback(() => {
    void loadPage1('refresh', filterRef.current);
    void loadSuggestions();
  }, [loadPage1, loadSuggestions]);

  const handleRename = async (person: Person, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === (person.name ?? '')) return;
    try {
      await renamePerson(person.id, trimmed);
      haptic('success');
      setToast(t('person.renamed'));
      // Patch the loaded windows in place — the next focus refreshes anyway.
      setPeople(
        (current) =>
          current?.map((candidate) =>
            candidate.id === person.id ? { ...candidate, name: trimmed } : candidate,
          ) ?? current,
      );
    } catch {
      setToast(t('person.renameFailed'));
    }
  };

  const clearFilters = useCallback(() => {
    setNamedFilter('all');
    setQuery('');
    setSearchResetKey((key) => key + 1);
  }, []);

  const newPeople = (suggestions?.newPeople ?? []).filter((s) => !dismissed.includes(s.id));
  const suggestionsLoading = suggestions === null;
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
  const showNoMatches =
    !showSkeleton && !error && hasWindow && (people?.length ?? 0) === 0;
  const showEmpty =
    !showSkeleton && !error && !hasWindow && (people?.length ?? 0) === 0 && newPeople.length === 0;

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Toolbar>
        <SearchBarHolder key={searchResetKey} onQueryChange={setQuery} placeholder={t('people.searchPlaceholder')} />
        <FilterRow>
          {FILTER_CHIPS.map((chip) => {
            const selected = namedFilter === chip.key;
            return (
              <FilterChip
                key={chip.key}
                $selected={selected}
                onPress={() => setNamedFilter(chip.key)}
                accessibilityRole="button"
                accessibilityLabel={t(chip.labelKey)}
                accessibilityState={{ selected }}
              >
                <FilterChipLabel variant="bodySmall" $selected={selected}>
                  {t(chip.labelKey)}
                </FilterChipLabel>
              </FilterChip>
            );
          })}
        </FilterRow>
        {/* The suggestions endpoint is the slow half — the affordance renders
          immediately (disabled, skeleton strip) so it never pops in late. The
          queue itself lives on the /people/review page. */}
        {suggestionsLoading || newPeople.length > 0 ? (
          <ReviewSuggestionsButton
            entering={FadeIn.duration(Durations.normal)}
            $loading={suggestionsLoading}
            disabled={suggestionsLoading}
            onPress={() => router.push('/people/review')}
            accessibilityRole="button"
            accessibilityLabel={t('people.reviewSuggestions')}
          >
            {suggestionsLoading ? (
              <LoadingStrip>
                {Array.from({ length: 3 }, (_, index) => (
                  <LoadingStripItem key={index} $first={index === 0}>
                    <Skeleton width={ms(28)} height={ms(28)} radius="full" />
                  </LoadingStripItem>
                ))}
              </LoadingStrip>
            ) : (
              <CyclingFaceStrip suggestions={newPeople} />
            )}
            <ReviewSuggestionsLabel variant="bodySmall" color="accent">
              {t('people.reviewSuggestions')}
            </ReviewSuggestionsLabel>
            {!suggestionsLoading ? (
              <ThemedText variant="bodySmall" color="accent">
                {tCount('people.reviewCount', newPeople.length, { count: newPeople.length })}
              </ThemedText>
            ) : null}
            {!suggestionsLoading ? (
              <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
            ) : null}
          </ReviewSuggestionsButton>
        ) : null}
        {hasWindow && totalCount > 0 ? (
          <ResultCount variant="label" color="secondary">
            {tCount('people.peopleCount', totalCount, { count: totalCount })}
          </ResultCount>
        ) : null}
      </Toolbar>

      {showSkeleton ? (
        <SkeletonPeopleGrid />
      ) : error ? (
        <Center $insetTop={0}>
          <ThemedText variant="bodySmall" color="danger">
            {error}
          </ThemedText>
          <RetryButton onPress={() => void loadPage1('initial', filterRef.current)}>
            <ThemedText variant="bodySmall" color="accent">
              {t('common.retry')}
            </ThemedText>
          </RetryButton>
        </Center>
      ) : showNoMatches ? (
        <Center $insetTop={0}>
          <EmptyState icon="search-outline" title={t('people.noMatchTitle')} subtitle={t('people.noMatchSubtitle')} />
          <RetryButton onPress={clearFilters}>
            <ThemedText variant="bodySmall" color="accent">
              {t('people.clearFilters')}
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
            keyExtractor={(person) => person.id}
            renderItem={({ item }) => (
              <PersonCardItem
                person={item}
                pending={pendingIds.has(item.id)}
                groupCount={groupCounts.get(item.id) ?? 0}
                onLongPress={() => setRenaming(item)}
              />
            )}
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
                onRefresh={refresh}
                tintColor={colors.textSecondary}
                progressBackgroundColor={colors.surface}
              />
            }
          />
        </ListArea>
      )}

      <PromptDialog
        visible={renaming !== null}
        title={t('person.rename')}
        initialValue={renaming?.name ?? ''}
        placeholder={t('people.unnamed')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        maxLength={200}
        onConfirm={(name) => {
          const person = renaming;
          setRenaming(null);
          if (person) void handleRename(person, name);
        }}
        onCancel={() => setRenaming(null)}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

/**
 * Isolated search field: owns the raw text so keystrokes never re-render the
 * grid, and commits the debounced value up (same 260ms cadence as the Search
 * tab). Remount (key change) is the reset path.
 */
function SearchBarHolder({
  placeholder,
  onQueryChange,
}: {
  placeholder: string;
  onQueryChange: (query: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onQueryChange(value), SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <SearchBar>
      <Icon name="search" size={20} color={colors.textSecondary} />
      <SearchInput
        value={text}
        onChangeText={update}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="words"
      />
      {text.length > 0 ? (
        <Pressable
          hitSlop={12}
          onPress={() => update('')}
          accessibilityRole="button"
          accessibilityLabel={t('search.clearA11y')}
        >
          <Icon name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </SearchBar>
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
  onLongPress,
}: {
  person: Person;
  pending: boolean;
  groupCount: number;
  onLongPress: () => void;
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
      onLongPress={() => {
        haptic('light');
        onLongPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={person.name ?? t('people.unnamed')}
      accessibilityHint={t('person.rename')}
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
