import { useEffect, useState } from 'react';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/skeleton/Skeleton';
import { FaceAvatar } from '@/components/people/FaceAvatar';
import { ReviewButton } from '@/components/people/ReviewButton';
import { ThemedText } from '@/components/ThemedText';
import { listSimilarPeople, type PersonSimilar } from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import {
  EmptyNotice,
  Footer,
  RowMeta,
  RowName,
  RowSkeleton,
  SheetContent,
  SimilarList,
  SimilarRow,
  TitleBlock,
} from './SimilarPeopleSheet.styles';

const PAGE_SIZE = 40;
/** Display floor, not a review gate — the endpoint ranks everything closer
 * than this so the user can judge the AI's near misses themselves (doc 18 §7.3). */
const MIN_SIMILARITY = 0.4;

interface SimilarPeopleSheetProps {
  /** Null hides the sheet; the last id stays rendered while it slides out. */
  personId: string | null;
  /** Display name of the absorbing person (heading + hint copy). */
  personName: string;
  /** Parent-side in-flight gate (kept separate from the sheet's own merging). */
  busy?: boolean;
  onClose: () => void;
  /** Folds the selected people into personId in ONE atomic request. Resolves
   * true on success — the sheet then clears the selection and reloads the
   * ranked list (the merged rows are gone server-side). */
  onMerge: (sourceIds: string[]) => Promise<boolean>;
}

/**
 * Manual "assimilate several groups at once" (doc 18 §7.3): every other person
 * ranked by centroid similarity to this one — including the pairs below the
 * suggestion threshold the review cards never surface. The user marks the
 * fragments that are really the same person and merges them in a single
 * merge-batch, the same uncapped path the "Merge all" cards use.
 */
export function SimilarPeopleSheet({
  personId,
  personName,
  busy = false,
  onClose,
  onMerge,
}: SimilarPeopleSheetProps) {
  const { t, tCount } = useTranslation();
  const { space } = useTheme();

  // Latch the person so the list doesn't blank mid slide-out, resetting the
  // paged rows and the selection for every open. Render-phase adjust — the
  // effect-based version trips cascading-render lint.
  const [latchedId, setLatchedId] = useState<string | null>(null);
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonSimilar[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [merging, setMerging] = useState(false);

  if (personId !== trackedId) {
    setTrackedId(personId);
    if (personId) {
      setLatchedId(personId);
      setPeople(null);
      setTotal(0);
      setLoadingMore(false);
      setSelected(new Set());
      setMerging(false);
    }
  }
  const shownId = personId ?? latchedId;

  // First page of the ranked candidates; the render-phase latch above already
  // reset the rows on person change, so the effect only fills state from the
  // async responses (sync setState in an effect trips cascading renders).
  useEffect(() => {
    if (!shownId) return;
    let alive = true;
    listSimilarPeople(shownId, MIN_SIMILARITY, 1, PAGE_SIZE)
      .then((result) => {
        if (!alive) return;
        setPeople(result.items);
        setTotal(result.totalCount);
      })
      .catch(() => {
        if (!alive) return;
        // Additive surface — an empty list beats an error wall (queue convention).
        setPeople([]);
      });
    return () => {
      alive = false;
    };
  }, [shownId]);

  /** Event-driven reload (after a successful merge): clears synchronously in
   * the handler, then refills from the fresh ranking. */
  const reloadList = (id: string) => {
    setPeople(null);
    setTotal(0);
    void listSimilarPeople(id, MIN_SIMILARITY, 1, PAGE_SIZE)
      .then((result) => {
        setPeople(result.items);
        setTotal(result.totalCount);
      })
      .catch(() => setPeople([]));
  };

  const loadMore = () => {
    if (!shownId || people === null || loadingMore || people.length >= total) return;
    setLoadingMore(true);
    listSimilarPeople(shownId, MIN_SIMILARITY, Math.floor(people.length / PAGE_SIZE) + 1, PAGE_SIZE)
      .then((result) => {
        setPeople((current) => {
          if (current === null) return result.items;
          const seen = new Set(current.map((person) => person.id));
          return [...current, ...result.items.filter((person) => !seen.has(person.id))];
        });
        setTotal(result.totalCount);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  const toggle = (id: string) => {
    haptic('light');
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const mergeSelected = async () => {
    if (!shownId || selected.size === 0 || merging || busy) return;
    setMerging(true);
    try {
      if (await onMerge([...selected])) {
        haptic('success');
        setSelected(new Set());
        reloadList(shownId);
      }
    } finally {
      setMerging(false);
    }
  };

  return (
    <BottomSheet visible={personId !== null} onClose={onClose} maxHeightFactor={0.85} fixedHeight>
      {shownId ? (
        <SheetContent>
          <TitleBlock>
            <ThemedText variant="titleMedium" numberOfLines={1}>
              {t('person.similarTitle', { name: personName })}
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {t('person.similarHint', { name: personName })}
            </ThemedText>
          </TitleBlock>
          <SimilarList
            data={people ?? []}
            keyExtractor={(person) => person.id}
            renderItem={({ item }) => (
              <SimilarRowItem
                person={item}
                selected={selected.has(item.id)}
                disabled={busy || merging}
                onToggle={() => toggle(item.id)}
              />
            )}
            ListEmptyComponent={
              people === null ? (
                <RowSkeletons />
              ) : (
                <EmptyNotice>
                  <ThemedText variant="bodySmall" color="secondary">
                    {t('person.similarEmpty')}
                  </ThemedText>
                </EmptyNotice>
              )
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{ paddingBottom: space[2] }}
          />
          <Footer>
            <ReviewButton
              icon="git-merge-outline"
              label={tCount('person.mergeSelected', selected.size, { count: selected.size })}
              busyLabel={t('suggestion.merging')}
              disabled={selected.size === 0 || busy}
              busy={merging || busy}
              onPress={() => void mergeSelected()}
            />
          </Footer>
        </SheetContent>
      ) : null}
    </BottomSheet>
  );
}

function SimilarRowItem({
  person,
  selected,
  disabled,
  onToggle,
}: {
  person: PersonSimilar;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t, tCount } = useTranslation();
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <SimilarRow
      $pressed={pressed}
      $selected={selected}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={person.name ?? t('people.unnamed')}
    >
      <FaceAvatar faceId={person.coverFaceId} size={44} />
      <RowMeta>
        <RowName variant="body" numberOfLines={1}>
          {person.name ?? t('people.unnamed')}
        </RowName>
        <ThemedText variant="bodySmall" color="secondary">
          {tCount('people.suggestionFacesCount', person.faceCount, { count: person.faceCount })} ·{' '}
          {t('suggestion.matchPercent', { match: Math.round(person.similarity * 100) })}
        </ThemedText>
      </RowMeta>
      <Icon
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.accent : colors.textSecondary}
      />
    </SimilarRow>
  );
}

/** Skeleton twin of the ranked rows while the first page loads. */
function RowSkeletons() {
  const { ms } = useTheme();
  return (
    <>
      {Array.from({ length: 5 }, (_, row) => (
        <RowSkeleton key={row}>
          <Skeleton width={ms(44)} height={ms(44)} radius="full" />
          <RowMeta>
            <Skeleton width="60%" height={ms(14)} radius="sm" />
            <Skeleton width="35%" height={ms(12)} radius="sm" />
          </RowMeta>
        </RowSkeleton>
      ))}
    </>
  );
}
