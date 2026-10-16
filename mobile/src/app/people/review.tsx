import { FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { NewPersonPreviewSheet } from '@/components/people/NewPersonPreviewSheet';
import { NewPersonSuggestionCard } from '@/components/people/NewPersonSuggestionCard';
import { ReviewBanner } from '@/components/people/ReviewBanner';
import {
  ReviewStepperSheet,
  type StepperItem,
  type StepperVerdict,
} from '@/components/people/ReviewStepperSheet';
import { Skeleton } from '@/components/skeleton/Skeleton';
import {
  acceptMergeSuggestion,
  acceptPersonSuggestion,
  listPersonSuggestionPage,
  listPersonSuggestions,
  mergePeopleBatch,
  type Person,
  type PersonMergeGroup,
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
import { SectionTitle, SkeletonCard, SkeletonMeta } from '@/screens/people/review.styles';

/**
 * The §7.4 review queue as a page (doc 18): the "same person?" merge-group
 * cards up top — ONE atomic merge-batch folds every member into the target —
 * then the paged "New faces" queue with infinite scroll (the backend caches
 * suggestions until faces/people change). Creating jumps to the new person's
 * photos (with the name input up); the queues are refetched on every focus so
 * returning here shows what is left.
 */
const PAGE_SIZE = 20;

export default function ReviewSuggestionsScreen() {
  const { t, tCount } = useTranslation();
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [queue, setQueue] = useState<PersonSuggestion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<PersonMergeGroup[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PersonSuggestion | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [reviewGroup, setReviewGroup] = useState<PersonMergeGroup | null>(null);
  const [busyReview, setBusyReview] = useState(false);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);
  const dismiss = useSuggestionDismissalsStore((s) => s.dismiss);

  // The two queues load independently — each is additive, so one failing
  // never blanks the other (hub convention).
  const load = useCallback(async () => {
    setQueue(null);
    setTotal(0);
    setGroups(null);
    void listPersonSuggestionPage(1, PAGE_SIZE)
      .then((result) => {
        setQueue(result.items);
        setTotal(result.totalCount);
      })
      .catch(() => {
        // Additive queue — an empty page beats an error wall here.
        setQueue([]);
      });
    void listPersonSuggestions()
      .then((result) => setGroups(result.personMergeGroups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible =
    queue === null ? null : queue.filter((suggestion) => !dismissed.includes(suggestion.id));
  const activeGroups = (groups ?? []).filter((group) => !dismissed.includes(group.id));

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
   * pictures are. The card leaves locally; refocusing this page re-syncs. */
  const create = async (suggestion: PersonSuggestion) => {
    setBusyId(suggestion.id);
    try {
      const person = await acceptPersonSuggestion(suggestion.faceIds);
      haptic('success');
      setPreview(null);
      dismiss(suggestion.id);
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

  /** "Merge all": every member folds into the target in ONE atomic request
   * (doc 18 §7.4) — the whole point of the group card. The card leaves the
   * list locally (no refetch flash); the next focus re-syncs the queues. */
  const handleMergeGroup = async (group: PersonMergeGroup) => {
    setBusyGroupId(group.id);
    try {
      const sourceIds = group.members.map((member) => member.personId);
      await mergePeopleBatch(group.target.personId, sourceIds);
      haptic('success');
      setToast(tCount('suggestion.mergedPeople', sourceIds.length, { count: sourceIds.length }));
      setGroups((current) =>
        current ? current.filter((candidate) => candidate.id !== group.id) : current,
      );
    } catch {
      setToast(t('suggestion.mergeFailed'));
    } finally {
      setBusyGroupId(null);
    }
  };

  const handleGroupReviewFinish = async (verdict: StepperVerdict) => {
    if (!reviewGroup) return;
    setBusyReview(true);
    try {
      if (verdict.accepted.length > 0) {
        await mergePeopleBatch(reviewGroup.target.personId, verdict.accepted);
        haptic('success');
        setToast(
          tCount('suggestion.mergedPeople', verdict.accepted.length, {
            count: verdict.accepted.length,
          }),
        );
        setGroups((current) =>
          current ? current.filter((candidate) => candidate.id !== reviewGroup.id) : current,
        );
      } else {
        // Finishing a group review with no merges is a dismissal (web parity).
        dismiss(reviewGroup.id);
      }
    } catch {
      setToast(t('suggestion.reviewFailed'));
    } finally {
      setBusyReview(false);
      setReviewGroup(null);
    }
  };

  const matchPercent = (value: number) =>
    t('suggestion.matchPercent', { match: Math.round(value * 100) });

  const groupTotalFaces = (group: PersonMergeGroup) =>
    group.target.faceCount + group.members.reduce((sum, member) => sum + member.faceCount, 0);

  const stepperItems: StepperItem[] = reviewGroup
    ? reviewGroup.members.map((member) => ({
        id: member.personId,
        faceId: member.coverFaceId,
        caption: member.name ?? t('people.unnamed'),
        meta:
          member.similarity != null
            ? `${tCount('suggestion.facesCount', member.faceCount, { count: member.faceCount })} · ${matchPercent(member.similarity)}`
            : tCount('suggestion.facesCount', member.faceCount, { count: member.faceCount }),
      }))
    : [];

  const noContent = visible !== null && visible.length === 0 && activeGroups.length === 0;

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.reviewSuggestions')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      {queue === null ? (
        <ListSkeleton />
      ) : noContent ? (
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
          ListHeaderComponent={
            activeGroups.length > 0 ? (
              <>
                <SectionTitle variant="titleMedium">{t('people.mergeGroupsTitle')}</SectionTitle>
                {activeGroups.map((group) => (
                  <ReviewBanner
                    key={group.id}
                    flush
                    faces={[
                      group.target.coverFaceId,
                      ...group.members.slice(0, 3).map((member) => member.coverFaceId),
                    ]}
                    total={group.members.length + 1}
                    title={tCount('suggestion.groupsLookLike', group.members.length, {
                      count: group.members.length,
                    })}
                    subtitle={`${tCount('suggestion.facesTotal', groupTotalFaces(group), {
                      count: groupTotalFaces(group),
                    })} · ${matchPercent(group.minSimilarity)}`}
                    reviewLabel={t('people.reviewFaces')}
                    primaryLabel={t('suggestion.mergeAll')}
                    primaryBusyLabel={t('suggestion.merging')}
                    busy={busyGroupId === group.id}
                    onReview={() => setReviewGroup(group)}
                    onPrimary={() => void handleMergeGroup(group)}
                    onDismiss={() => dismiss(group.id)}
                  />
                ))}
                <SectionTitle variant="titleMedium">{t('people.newFaces')}</SectionTitle>
              </>
            ) : null
          }
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

      <ReviewStepperSheet
        visible={reviewGroup !== null}
        onClose={() => setReviewGroup(null)}
        mode="group"
        reference={{
          faceId: reviewGroup?.target.coverFaceId ?? null,
          name: reviewGroup?.target.name ?? t('people.unnamed'),
        }}
        items={stepperItems}
        busy={busyReview}
        onFinish={(verdict) => void handleGroupReviewFinish(verdict)}
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
