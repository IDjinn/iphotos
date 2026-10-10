import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, FadeOut } from 'react-native-reanimated';

import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CloudPhotoGrid } from '@/components/CloudPhotoGrid';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import {
  ActionButton,
  ActionLabel,
  ActionsRow,
  Center,
  GridArea,
  Header,
  HeaderSpacer,
  HeaderTitle,
  MergeCircle,
  MergeCirclePlaceholder,
  MergeEmpty,
  MergeHeading,
  MergeList,
  MergeMeta,
  MergeName,
  MergeRow,
  RenameInput,
  Screen,
} from '@/screens/person/[id].styles';
import {
  deletePerson,
  faceCropSource,
  listPeople,
  listPersonPhotos,
  mergePeople,
  renamePerson,
  type Person,
} from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/**
 * One person (backend face cluster, doc 18 §10): photo grid + rename, merge
 * into another person and remove. Face-level corrections (move between people)
 * stay on the API for a future UI pass.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, tCount } = useTranslation();

  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridToken, setGridToken] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [mergeSheetVisible, setMergeSheetVisible] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Person[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchPage = useCallback(
    (page: number, pageSize: number) => listPersonPhotos(id, page, pageSize),
    [id],
  );

  const loadPerson = useCallback(async () => {
    try {
      const people = await listPeople();
      setPerson(people.find((candidate) => candidate.id === id) ?? null);
    } catch {
      setPerson(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadPerson();
  }, [loadPerson]);

  const displayName = person?.name ?? t('people.unnamed');

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

  const openMergeSheet = async () => {
    if (!person) return;
    try {
      const people = await listPeople();
      setMergeTargets(people.filter((candidate) => candidate.id !== person.id));
      setMergeSheetVisible(true);
    } catch {
      setToast(t('person.mergeFailed'));
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

      <GridArea>
        <CloudPhotoGrid fetchPage={fetchPage} refreshToken={gridToken} />
      </GridArea>

      {!renaming ? (
        <ActionsRow>
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
        <MergeList>
          {mergeTargets.length === 0 ? (
            <MergeEmpty variant="bodySmall" color="secondary">
              {t('person.mergeEmpty')}
            </MergeEmpty>
          ) : null}
          {mergeTargets.map((target) => {
            const cover = target.coverFaceId ? faceCropSource(target.coverFaceId) : null;
            return (
              <MergeRow
                key={target.id}
                $pressed={false}
                onPressIn={() => undefined}
                onPressOut={() => undefined}
                onPress={() => void handleMerge(target)}
                accessibilityRole="button"
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
          })}
        </MergeList>
      </BottomSheet>

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
