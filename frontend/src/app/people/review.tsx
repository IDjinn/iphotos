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
import { ThemedText } from '@/components/ThemedText';
import {
  acceptPersonSuggestion,
  listPersonSuggestions,
  type PersonSuggestion,
  type PersonSuggestions,
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
 * cluster the backend suggests grouping into a new person, with create /
 * not-now and a photo preview per card. Creating keeps you here so the rest
 * of the queue keeps flowing; the queue is refetched on every focus (cheap —
 * the backend caches suggestions until faces/people change).
 */
export default function ReviewSuggestionsScreen() {
  const { t } = useTranslation();
  const { space, ms } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [suggestions, setSuggestions] = useState<PersonSuggestions | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PersonSuggestion | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);
  const dismiss = useSuggestionDismissalsStore((s) => s.dismiss);

  const load = useCallback(async () => {
    try {
      setSuggestions(await listPersonSuggestions());
    } catch {
      // The queue is additive — an empty page beats an error wall here.
      setSuggestions({ newPeople: [], merges: [], personMergeGroups: [] });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const queue = (suggestions?.newPeople ?? []).filter((s) => !dismissed.includes(s.id));

  const create = async (suggestion: PersonSuggestion) => {
    setBusyId(suggestion.id);
    try {
      await acceptPersonSuggestion(suggestion.faceIds);
      haptic('success');
      setToast(t('people.personCreated'));
      void load();
    } catch {
      setToast(t('people.createFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.reviewSuggestions')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      {suggestions === null ? (
        <ListSkeleton />
      ) : queue.length === 0 ? (
        <Center $insetTop={0}>
          <EmptyState icon="sparkles-outline" title={t('people.reviewEmpty')} />
        </Center>
      ) : (
        <FlatList
          data={queue}
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
        onDismiss={(candidate) => {
          setPreview(null);
          dismiss(candidate.id);
        }}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

/** Loading twin of a suggestion card: overlapping face crops + copy lines. */
function ListSkeleton() {
  const { space, ms } = useTheme();
  return (
    <FlatList
      data={[0, 1, 2]}
      keyExtractor={(item) => String(item)}
      renderItem={() => (
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
      )}
      contentContainerStyle={{
        paddingHorizontal: space[3],
        paddingTop: space[2],
        gap: space[3],
        paddingBottom: space[3],
      }}
    />
  );
}
