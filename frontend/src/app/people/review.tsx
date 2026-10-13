import { FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { NewPersonPreviewSheet } from '@/components/people/NewPersonPreviewSheet';
import { NewPersonSuggestionCard } from '@/components/people/NewPersonSuggestionCard';
import { Skeleton } from '@/components/skeleton/Skeleton';
import {
  acceptMergeSuggestion,
  acceptPersonSuggestion,
  listPersonSuggestionPage,
  type Person,
  type PersonSuggestion,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useSuggestionDismissalsStore } from '@/stores/suggestion-dismissals';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import {
  Center,
  Header,
  HeaderSpacer,
  HeaderTitle,
  LoadingStrip,
  LoadingStripItem,
  Screen,
} from '@/screens/people.styles';
import { SkeletonCard, SkeletonMeta } from '@/screens/people/review.styles';

/**
 * The "New faces" review queue as a page (doc 18 §7.4): every unassigned-face
 * cluster the backend suggests grouping into a new person, paged with infinite
 * scroll (the backend caches suggestions until faces/people change). Creating
 * jumps to the new person's photos (with the name input up); the queue is
 * refetched on every focus so returning here shows what is left.
 */
const PAGE_SIZE = 20;

export default function ReviewSuggestionsScreen() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [queue, setQueue] = useState<PersonSuggestion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PersonSuggestion | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);
  const dismiss = useSuggestionDismissalsStore((s) => s.dismiss);

  const load = useCallback(async () => {
    setQueue(null);
    setTotal(0);
    try {
      const result = await listPersonSuggestionPage(1, PAGE_SIZE);
      setQueue(result.items);
      setTotal(result.totalCount);
    } catch {
      // Additive queue — an empty page beats an error wall here.
      setQueue([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible =
    queue === null ? null : queue.filter((suggestion) => !dismissed.includes(suggestion.id));

  const loadMore = () => {
    if (queue === null || loadingMore || queue.length >= total) return;
    setLoadingMore(true);
    listPersonSuggestionPage(Math.floor(queue.length / PAGE_SIZE) + 1, PAGE_SIZE)
      .then((result) => {
        setQueue((current) => {
          if (current === null) return result.items;
          const seen = new Set(current.map((suggestion) => suggestion.id));
          return [...current, ...result.items.filter((suggestion) => !seen.has(suggestion.id))];
        });
        setTotal(result.totalCount);
      })
      .catch(() => undefined)
      // A failed window stops the pull quietly; scrolling again retries it.
      .finally(() => setLoadingMore(false));
  };

  /** Creates the person and jumps straight to their photos — the `name`
   * param opens the page's rename input so the person gets named where their
   * pictures are. The queue refreshes underneath for the back navigation. */
  const create = async (suggestion: PersonSuggestion) => {
    setBusyId(suggestion.id);
    try {
      const person = await acceptPersonSuggestion(suggestion.faceIds);
      haptic('success');
      setPreview(null);
      dismiss(suggestion.id);
      void load();
      router.push({
        pathname: '/person/[id]',
        params: { id: person.id, name: '1' },
      });
    } catch {
      setToast(t('people.createFailed'));
    } finally {
      setBusyId(null);
    }
  };

  /** Folds the cluster into an existing person the AI failed to match — same
   * uncapped assign path as the merge review. */
  const assign = async (suggestion: PersonSuggestion, person: Person) => {
    setBusyId(suggestion.id);
    try {
      await acceptMergeSuggestion(person.id, suggestion.faceIds);
      haptic('success');
      setToast(t('people.addedToPerson', { name: person.name ?? t('people.unnamed') }));
      setPreview(null);
      dismiss(suggestion.id);
      void load();
    } catch {
      setToast(t('suggestion.addFailed'));
    } finally {
      setBusyId(null);
    }
  };

  /** The previewed cluster vanished server-side (assigned elsewhere) — close
   * and refresh so the stale card leaves the queue. */
  const handleGone = useCallback(
    (suggestion: PersonSuggestion) => {
      setPreview(null);
      dismiss(suggestion.id);
      void load();
    },
    [dismiss, load],
  );

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.reviewSuggestions')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      {visible === null ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        <Center $insetTop={0}>
          <EmptyState icon="sparkles-outline" title={t('people.reviewEmpty')} />
        </Center>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(suggestion) => suggestion.id}
          renderItem={({ item }) => (
            <NewPersonSuggestionCard
              suggestion={item}
              busy={busyId === item.id}
              onCreate={(candidate) => void create(candidate)}
              onDismiss={(candidate) => dismiss(candidate.id)}
              onPreview={setPreview}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <QueueSkeletonCard /> : null}
          contentContainerStyle={{
            paddingHorizontal: space[3],
            paddingTop: space[2],
            gap: space[3],
            paddingBottom: insets.bottom + space[3],
          }}
        />
      )}

      <NewPersonPreviewSheet
        suggestion={preview}
        busy={preview ? busyId === preview.id : false}
        onClose={() => setPreview(null)}
        onCreate={(candidate) => void create(candidate)}
        onAssign={(candidate, person) => void assign(candidate, person)}
        onDismiss={(candidate) => {
          setPreview(null);
          dismiss(candidate.id);
        }}
        onGone={handleGone}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

/** Loading twin of a suggestion card: overlapping face crops + copy lines. */
function QueueSkeletonCard() {
  const { ms } = useTheme();
  return (
    <SkeletonCard>
      <LoadingStrip>
        {Array.from({ length: 3 }, (_, index) => (
          <LoadingStripItem key={index} $first={index === 0}>
            <Skeleton width={ms(40)} height={ms(40)} radius="full" />
          </LoadingStripItem>
        ))}
      </LoadingStrip>
      <SkeletonMeta>
        <Skeleton width="70%" height={ms(14)} radius="sm" />
        <Skeleton width="40%" height={ms(14)} radius="sm" />
      </SkeletonMeta>
    </SkeletonCard>
  );
}

/** Initial-load skeleton: a few cards with the queue's rhythm. */
function ListSkeleton() {
  const { space } = useTheme();
  return (
    <FlatList
      data={[0, 1, 2]}
      keyExtractor={(item) => String(item)}
      renderItem={() => <QueueSkeletonCard />}
      contentContainerStyle={{
        paddingHorizontal: space[3],
        paddingTop: space[2],
        gap: space[3],
        paddingBottom: space[3],
      }}
    />
  );
}
