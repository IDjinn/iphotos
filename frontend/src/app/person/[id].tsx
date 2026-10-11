import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { CloudPhotoGrid } from '@/components/CloudPhotoGrid';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import { ReviewBanner } from '@/components/people/ReviewBanner';
import { ReviewStepperSheet, type StepperItem } from '@/components/people/ReviewStepperSheet';
import {
  acceptMergeSuggestion,
  deletePerson,
  getPerson,
  listPersonPhotos,
  listPersonSuggestions,
  listPeoplePage,
  mergePeople,
  mergePeopleBatch,
  renamePerson,
  submitFaceReview,
  type Person,
  type PersonDetail,
  type PersonMergeGroup,
  type PersonSuggestions,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useFaceCropSource } from '@/hooks/use-cloud-file';
import { useSuggestionDismissalsStore } from '@/stores/suggestion-dismissals';
import {
  ActionButton,
  ActionLabel,
  ActionsRow,
  BannerStack,
  Center,
  ConfidenceBar,
  ConfidenceFill,
  ConfidenceLabel,
  ConfidenceTrack,
  ConfidenceValue,
  GridArea,
  Header,
  HeaderSpacer,
  HeaderTitle,
  MergeCircle,
  MergeCirclePlaceholder,
  MergeEmpty,
  MergeHeading,
  MergeListContainer,
  MergeMeta,
  MergeName,
  MergeRow,
  RenameInput,
  Screen,
} from '@/screens/person/[id].styles';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const MERGE_PAGE_SIZE = 50;

/**
 * One person (backend face cluster, doc 18 §10): photo grid + rename, merge
 * into another person and remove, plus the §7.4 review banners (face
 * suggestions and "same person?" groups, web parity) and the match-confidence
 * bar.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, tCount } = useTranslation();

  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [suggestions, setSuggestions] = useState<PersonSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridToken, setGridToken] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [mergeSheetVisible, setMergeSheetVisible] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Person[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const targetPage = useRef(2);
  const [hasMoreTargets, setHasMoreTargets] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [reviewFor, setReviewFor] = useState<'faces' | 'group' | null>(null);
  const [busyBanner, setBusyBanner] = useState(false);
  const [busyReview, setBusyReview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dismissed = useSuggestionDismissalsStore((s) => s.dismissed);
  const dismiss = useSuggestionDismissalsStore((s) => s.dismiss);

  const fetchPage = useCallback(
    (page: number, pageSize: number) => listPersonPhotos(id, page, pageSize),
    [id],
  );

  const reload = useCallback(async () => {
    try {
      const [detail, queue] = await Promise.all([getPerson(id), listPersonSuggestions()]);
      setPerson(detail);
      setSuggestions(queue);
    } catch {
      setPerson(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const displayName = person?.name ?? t('people.unnamed');
  const matchPercent = (value: number) =>
    t('suggestion.matchPercent', { match: Math.round(value * 100) });

  // ── §7.4 suggestions for this person ──────────────────────────────────────

  const pendingFaceMerge =
    suggestions?.merges.find((m) => m.personId === id && !dismissed.includes(m.id)) ?? null;

  const pendingGroup =
    suggestions?.personMergeGroups.find(
      (group) =>
        !dismissed.includes(group.id) &&
        (group.target.personId === id ||
          group.members.some((member) => member.personId === id)),
    ) ?? null;

  const handleRename = async () => {
    const trimmed = draftName.trim();
    setRenaming(false);
    if (!trimmed || !person) return;
    try {
      await renamePerson(person.id, trimmed);
      setPerson({ ...person, name: trimmed });
      setToast(t('person.renamed'));
    } catch {
      setToast(t('person.renameFailed'));
    }
  };

  const handleAddFaces = async () => {
    if (!person || !pendingFaceMerge) return;
    setBusyBanner(true);
    try {
      await acceptMergeSuggestion(person.id, pendingFaceMerge.faceIds);
      haptic('success');
      setToast(
        tCount('suggestion.addedFaces', pendingFaceMerge.faceIds.length, {
          count: pendingFaceMerge.faceIds.length,
        }),
      );
      setGridToken((token) => token + 1);
      await reload();
    } catch {
      setToast(t('suggestion.addFailed'));
    } finally {
      setBusyBanner(false);
    }
  };

  const handleMergeAll = async () => {
    if (!pendingGroup) return;
    setBusyBanner(true);
    try {
      const sourceIds = pendingGroup.members.map((member) => member.personId);
      await mergePeopleBatch(pendingGroup.target.personId, sourceIds);
      haptic('success');
      setToast(tCount('suggestion.mergedPeople', sourceIds.length, { count: sourceIds.length }));
      setGridToken((token) => token + 1);
      await reload();
    } catch {
      setToast(t('suggestion.mergeFailed'));
    } finally {
      setBusyBanner(false);
    }
  };

  const handleMergeInto = async (group: PersonMergeGroup) => {
    setBusyBanner(true);
    try {
      await mergePeople(id, group.target.personId);
      haptic('success');
      setToast(
        t('suggestion.mergedInto', { name: group.target.name ?? t('people.unnamed') }),
      );
      // Leave this person's screen before reloading — it no longer exists.
      router.replace(`/person/${group.target.personId}`);
    } catch {
      setToast(t('suggestion.mergeFailed'));
      setBusyBanner(false);
    }
  };

  // ── One-by-one review stepper ─────────────────────────────────────────────

  const stepperItems: StepperItem[] =
    reviewFor === 'faces' && pendingFaceMerge
      ? pendingFaceMerge.faceIds.map((faceId) => ({
          id: faceId,
          faceId,
          caption: t('suggestion.candidateFace'),
        }))
      : reviewFor === 'group' && pendingGroup
        ? pendingGroup.members.map((member) => ({
            id: member.personId,
            faceId: member.coverFaceId,
            caption: member.name ?? t('people.unnamed'),
            meta:
              member.similarity != null
                ? `${tCount('suggestion.facesCount', member.faceCount, { count: member.faceCount })} · ${matchPercent(member.similarity)}`
                : tCount('suggestion.facesCount', member.faceCount, { count: member.faceCount }),
          }))
        : [];

  const stepperReference =
    reviewFor === 'group' && pendingGroup
      ? {
          faceId: pendingGroup.target.coverFaceId,
          name: pendingGroup.target.name ?? t('people.unnamed'),
        }
      : { faceId: person?.coverFaceId ?? null, name: displayName };

  const handleReviewFinish = async (verdict: {
    accepted: string[];
    rejected: string[];
    unsure: string[];
  }) => {
    setBusyReview(true);
    try {
      if (reviewFor === 'faces' && pendingFaceMerge) {
        await submitFaceReview(id, {
          acceptedFaceIds: verdict.accepted,
          rejectedFaceIds: verdict.rejected,
          unsureFaceIds: verdict.unsure,
        });
        dismiss(pendingFaceMerge.id);
        setToast(
          verdict.accepted.length > 0
            ? tCount('suggestion.addedFaces', verdict.accepted.length, {
                count: verdict.accepted.length,
              })
            : t('suggestion.reviewSaved'),
        );
        setGridToken((token) => token + 1);
        await reload();
      } else if (reviewFor === 'group' && pendingGroup) {
        if (verdict.accepted.length > 0) {
          await mergePeopleBatch(pendingGroup.target.personId, verdict.accepted);
          haptic('success');
          setToast(
            tCount('suggestion.mergedPeople', verdict.accepted.length, {
              count: verdict.accepted.length,
            }),
          );
          setGridToken((token) => token + 1);
          await reload();
        } else {
          // Finishing a group review with no merges is a dismissal (web parity).
          dismiss(pendingGroup.id);
        }
      }
    } catch {
      setToast(t('suggestion.reviewFailed'));
    } finally {
      setBusyReview(false);
      setReviewFor(null);
    }
  };

  // ── Manual merge sheet (paged) ────────────────────────────────────────────

  const openMergeSheet = async () => {
    if (!person) return;
    setMergeSheetVisible(true);
    setLoadingTargets(true);
    try {
      const page = await listPeoplePage(1, MERGE_PAGE_SIZE);
      targetPage.current = 2;
      setHasMoreTargets(page.items.length < page.totalCount);
      setMergeTargets(page.items.filter((candidate) => candidate.id !== person.id));
    } catch {
      setMergeSheetVisible(false);
      setToast(t('person.mergeFailed'));
    } finally {
      setLoadingTargets(false);
    }
  };

  const loadMoreTargets = async () => {
    if (loadingTargets || !hasMoreTargets) return;
    setLoadingTargets(true);
    try {
      const page = await listPeoplePage(targetPage.current, MERGE_PAGE_SIZE);
      targetPage.current += 1;
      setHasMoreTargets(page.items.length < page.totalCount);
      setMergeTargets((current) => {
        const seen = new Set(current.map((candidate) => candidate.id));
        return [...current, ...page.items.filter((candidate) => !seen.has(candidate.id))];
      });
    } catch {
      setHasMoreTargets(false);
    } finally {
      setLoadingTargets(false);
    }
  };

  const handleMerge = async (target: Person) => {
    if (!person) return;
    setMergeSheetVisible(false);
    try {
      await mergePeople(person.id, target.id);
      haptic('success');
      router.replace(`/person/${target.id}`);
    } catch {
      setToast(t('person.mergeFailed'));
    }
  };

  const handleDelete = async () => {
    setDeleteConfirm(false);
    if (!person) return;
    try {
      await deletePerson(person.id);
      haptic('success');
      router.back();
    } catch {
      setToast(t('person.deleteFailed'));
    }
  };

  if (loading) {
    return (
      <Center $insetTop={insets.top}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Center>
    );
  }

  return (
    <Screen $insetTop={insets.top}>
      {renaming ? (
        <Header entering={FadeIn.duration(150)}>
          <Pressable hitSlop={12} onPress={() => setRenaming(false)} accessibilityLabel={t('album.cancelRename')}>
            <Icon name="close" size={22} />
          </Pressable>
          <RenameInput
            autoFocus
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={() => void handleRename()}
            maxLength={200}
          />
          <Pressable hitSlop={12} onPress={() => void handleRename()} accessibilityLabel={t('album.confirmRename')}>
            <Icon name="checkmark" size={24} color={colors.accent} />
          </Pressable>
        </Header>
      ) : (
        <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium" numberOfLines={1}>
            {displayName}
            {person ? `  ·  ${tCount('people.photosCount', person.faceCount, { count: person.faceCount })}` : ''}
          </HeaderTitle>
          <HeaderSpacer />
        </Header>
      )}

      {person?.confidence != null ? (
        <ConfidenceBar>
          <ConfidenceLabel variant="bodySmall" color="secondary">
            {t('suggestion.confidence')}
          </ConfidenceLabel>
          <ConfidenceTrack>
            <ConfidenceFill $value={person.confidence} />
          </ConfidenceTrack>
          <ConfidenceValue variant="bodySmall" color="secondary">
            {Math.round(person.confidence * 100)}%
          </ConfidenceValue>
        </ConfidenceBar>
      ) : null}

      <BannerStack>
        {pendingFaceMerge ? (
          <ReviewBanner
            faces={[pendingFaceMerge.coverFaceId]}
            total={pendingFaceMerge.faceCount}
            title={tCount('suggestion.facesLookLike', pendingFaceMerge.faceCount, {
              count: pendingFaceMerge.faceCount,
            })}
            subtitle={matchPercent(pendingFaceMerge.similarity)}
            reviewLabel={t('suggestion.reviewFaces')}
            primaryLabel={t('suggestion.addFaces')}
            primaryBusyLabel={t('suggestion.adding')}
            busy={busyBanner}
            onReview={() => setReviewFor('faces')}
            onPrimary={() => void handleAddFaces()}
            onDismiss={() => dismiss(pendingFaceMerge.id)}
          />
        ) : null}
        {pendingGroup && pendingGroup.target.personId === id ? (
          <ReviewBanner
            faces={pendingGroup.members.slice(0, 4).map((member) => member.coverFaceId)}
            title={tCount('suggestion.groupsLookLike', pendingGroup.members.length, {
              count: pendingGroup.members.length,
            })}
            subtitle={`${tCount('suggestion.facesTotal', pendingGroup.target.faceCount + pendingGroup.members.reduce((sum, member) => sum + member.faceCount, 0), {
              count: pendingGroup.target.faceCount + pendingGroup.members.reduce((sum, member) => sum + member.faceCount, 0),
            })} · ${matchPercent(pendingGroup.minSimilarity)}`}
            reviewLabel={t('suggestion.reviewFaces')}
            primaryLabel={t('suggestion.mergeAll')}
            primaryBusyLabel={t('suggestion.merging')}
            busy={busyBanner}
            onReview={() => setReviewFor('group')}
            onPrimary={() => void handleMergeAll()}
            onDismiss={() => dismiss(pendingGroup.id)}
          />
        ) : null}
        {pendingGroup && pendingGroup.target.personId !== id ? (
          <ReviewBanner
            faces={[person?.coverFaceId ?? null, pendingGroup.target.coverFaceId]}
            title={t('suggestion.samePersonAs', {
              name: pendingGroup.target.name ?? t('people.unnamed'),
            })}
            subtitle={`${tCount('suggestion.facesCount', pendingGroup.target.faceCount, {
              count: pendingGroup.target.faceCount,
            })} · ${matchPercent(pendingGroup.minSimilarity)}`}
            reviewLabel={t('suggestion.reviewFaces')}
            primaryLabel={
              pendingGroup.target.name
                ? t('suggestion.mergeInto', {
                    name: pendingGroup.target.name,
                  })
                : t('suggestion.merge')
            }
            primaryBusyLabel={t('suggestion.merging')}
            busy={busyBanner}
            onReview={() => setReviewFor('group')}
            onPrimary={() => void handleMergeInto(pendingGroup)}
            onDismiss={() => dismiss(pendingGroup.id)}
          />
        ) : null}
      </BannerStack>

      <GridArea>
        <CloudPhotoGrid fetchPage={fetchPage} refreshToken={gridToken} />
      </GridArea>

      {!renaming ? (
        <ActionsRow $insetBottom={insets.bottom}>
          <ActionButton
            onPress={() => {
              haptic('light');
              setDraftName(person?.name ?? '');
              setRenaming(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('person.rename')}
          >
            <Icon name="create-outline" size={20} color={colors.text} />
            <ActionLabel variant="bodySmall">{t('person.rename')}</ActionLabel>
          </ActionButton>
          <ActionButton
            onPress={() => {
              haptic('light');
              void openMergeSheet();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('person.mergeInto')}
          >
            <Icon name="git-merge-outline" size={20} color={colors.text} />
            <ActionLabel variant="bodySmall">{t('person.mergeInto')}</ActionLabel>
          </ActionButton>
          <ActionButton
            onPress={() => {
              haptic('light');
              setDeleteConfirm(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('person.delete')}
          >
            <Icon name="trash-outline" size={20} color={colors.danger} />
            <ActionLabel variant="bodySmall" color="danger">
              {t('person.delete')}
            </ActionLabel>
          </ActionButton>
        </ActionsRow>
      ) : null}

      <BottomSheet visible={mergeSheetVisible} onClose={() => setMergeSheetVisible(false)}>
        <MergeHeading variant="titleMedium">{t('person.mergeIntoTitle')}</MergeHeading>
        <MergeListContainer>
          <FlatList
            data={mergeTargets}
            keyExtractor={(target) => target.id}
            renderItem={({ item }) => <MergeTargetRow target={item} onMerge={handleMerge} />}
            ListEmptyComponent={
              loadingTargets ? null : (
                <MergeEmpty variant="bodySmall" color="secondary">
                  {t('person.mergeEmpty')}
                </MergeEmpty>
              )
            }
            ListFooterComponent={loadingTargets ? <SheetSpinner /> : null}
            onEndReached={() => void loadMoreTargets()}
            onEndReachedThreshold={0.6}
          />
        </MergeListContainer>
      </BottomSheet>

      <ReviewStepperSheet
        visible={reviewFor !== null && stepperItems.length > 0}
        onClose={() => setReviewFor(null)}
        mode={reviewFor ?? 'faces'}
        reference={stepperReference}
        items={stepperItems}
        busy={busyReview}
        onFinish={(verdict) => void handleReviewFinish(verdict)}
      />

      <ConfirmDialog
        visible={deleteConfirm}
        title={t('person.deleteTitle')}
        message={t('person.deleteMessage')}
        confirmLabel={t('person.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirm(false)}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

function SheetSpinner() {
  const { colors } = useTheme();
  return (
    <Center $insetTop={0}>
      <ActivityIndicator size="small" color={colors.accent} />
    </Center>
  );
}

/** Merge-sheet row: target cover from the persistent face-crop cache. */
function MergeTargetRow({ target, onMerge }: { target: Person; onMerge: (target: Person) => Promise<void> }) {
  const { t, tCount } = useTranslation();
  const { colors } = useTheme();
  const cover = useFaceCropSource(target.coverFaceId);

  return (
    <MergeRow
      $pressed={false}
      onPressIn={() => undefined}
      onPressOut={() => undefined}
      onPress={() => void onMerge(target)}
      accessibilityRole="button"
      accessibilityLabel={target.name ?? t('people.unnamed')}
    >
      {cover ? (
        <MergeCircle source={cover} contentFit="cover" recyclingKey={target.id} />
      ) : (
        <MergeCirclePlaceholder>
          <Icon name="person" size={20} color={colors.textSecondary} />
        </MergeCirclePlaceholder>
      )}
      <MergeMeta>
        <MergeName variant="body" numberOfLines={1}>
          {target.name ?? t('people.unnamed')}
        </MergeName>
        <ThemedText variant="bodySmall" color="secondary">
          {tCount('people.photosCount', target.faceCount, { count: target.faceCount })}
        </ThemedText>
      </MergeMeta>
    </MergeRow>
  );
}
