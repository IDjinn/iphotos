import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, FadeOut } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { SelectionBar } from '@/components/SelectionBar';
import { AlbumPickerSheet } from '@/components/AlbumPickerSheet';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import {
  Center,
  CreateButton,
  CreateHint,
  CreateInput,
  CreateWrap,
  Header,
  HeaderSpacer,
  HeaderTitle,
  RenameInput,
  Screen,
} from '@/app/album/[id].styles';
import { createAlbum, getAlbum, getAlbumAssetIds, renameAlbum } from '@/data/albums-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import { listFavoriteIds } from '@/data/favorites-repository';
import type { PhotoAsset } from '@/data/types';
import { useBulkActions } from '@/hooks/use-bulk-actions';
import { useTranslation } from '@/i18n/hook';
import { useLibraryStore } from '@/stores/library';
import { useSelectionStore } from '@/stores/selection';
import { useViewerStore } from '@/stores/viewer';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const FAVORITES_ID = 'favorites';

/**
 * Album detail. Handles the virtual "favorites" album and the "new"
 * route used by the Library tab to create an album inline.
 */
export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, tCount, localeTag } = useTranslation();

  const isFavorites = id === FAVORITES_ID;
  const isNew = id === 'new';

  const [title, setTitle] = useState(isFavorites ? t('library.favorites') : '');
  const [albumId, setAlbumId] = useState<string | null>(isNew ? null : isFavorites ? null : (id as string));
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectionActive = useSelectionStore((s) => s.active);
  const selectedCount = useSelectionStore((s) => s.ids.length);
  const refreshLibrary = useLibraryStore((s) => s.refresh);

  const load = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (isFavorites) {
      const ids = listFavoriteIds();
      const items = await fetchAssetsByIds(ids);
      // Preserve favorites order (most recent favorite first).
      const order = new Map(ids.map((v, i) => [v, i]));
      items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setAssets(items);
      setTitle(t('library.favorites'));
    } else if (id) {
      const album = getAlbum(id);
      setTitle(album?.title ?? t('album.fallbackTitle'));
      const items = await fetchAssetsByIds(getAlbumAssetIds(id));
      setAssets(items);
    }
    setLoading(false);
  }, [id, isFavorites, isNew, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reload favorites when the favorite set changes elsewhere (viewer).
  const favoriteStamp = useLibraryStore((s) => s.favoriteIds.length);
  useEffect(() => {
    if (isFavorites) void load();
  }, [favoriteStamp, isFavorites, load]);

  // Reload album when its membership changes (added from other screens).
  const albumStamp = useLibraryStore((s) => s.albums.find((a) => a.id === albumId)?.itemCount);
  useEffect(() => {
    if (albumId && !isFavorites) void load();
  }, [albumStamp, albumId, isFavorites, load]);

  const bulk = useBulkActions({
    assets,
    applyRemovals: (ids) => setAssets((prev) => prev.filter((a) => !ids.includes(a.id))),
    albumId: albumId ?? undefined,
  });

  const viewerContext = isFavorites ? 'favorites' : 'album';

  const createNew = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const album = createAlbum(trimmed);
    useLibraryStore.getState().addAlbum(album);
    setAlbumId(album.id);
    setTitle(album.title);
    haptic('success');
    router.replace(`/album/${album.id}`);
  };

  const handleRename = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || !albumId) {
      setRenaming(false);
      return;
    }
    renameAlbum(albumId, trimmed);
    setTitle(trimmed);
    refreshLibrary();
    setRenaming(false);
    setToast(t('album.renamed'));
  };

  if (loading) {
    return (
      <Center $insetTop={insets.top}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Center>
    );
  }

  // ----- Create-album flow -----
  if (isNew) {
    return (
      <Screen $insetTop={insets.top}>
        <Header>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.cancel')}>
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium">{t('albums.create')}</ThemedText>
          <HeaderSpacer />
        </Header>
        <CreateWrap>
          <CreateInput
            autoFocus
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder={t('album.titlePlaceholder')}
            placeholderTextColor={colors.textDisabled}
            onSubmitEditing={() => createNew(draftTitle)}
            maxLength={60}
            returnKeyType="done"
          />
          <CreateButton
            $enabled={Boolean(draftTitle.trim())}
            disabled={!draftTitle.trim()}
            onPress={() => createNew(draftTitle)}
          >
            <ThemedText variant="body" color={draftTitle.trim() ? 'inverse' : 'secondary'}>
              {t('album.createButton')}
            </ThemedText>
          </CreateButton>
          <CreateHint variant="bodySmall" color="secondary">
            {t('album.createHint')}
          </CreateHint>
        </CreateWrap>
      </Screen>
    );
  }

  // ----- Album detail -----
  return (
    <Screen $insetTop={insets.top}>
      {renaming ? (
        <Header entering={FadeIn.duration(150)}>
          <Pressable hitSlop={12} onPress={() => setRenaming(false)} accessibilityLabel={t('album.cancelRename')}>
            <Icon name="close" size={22} />
          </Pressable>
          <RenameInput
            autoFocus
            value={draftTitle}
            onChangeText={setDraftTitle}
            onSubmitEditing={handleRename}
            maxLength={60}
          />
          <Pressable hitSlop={12} onPress={handleRename} accessibilityLabel={t('album.confirmRename')}>
            <Icon name="checkmark" size={24} color={colors.accent} />
          </Pressable>
        </Header>
      ) : selectionActive ? (
        <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Pressable hitSlop={12} onPress={() => useSelectionStore.getState().end()} accessibilityLabel={t('selection.exit')}>
            <Icon name="close" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium">
            {tCount('selection.count', selectedCount, { count: selectedCount.toLocaleString(localeTag) })}
          </HeaderTitle>
          <HeaderSpacer />
        </Header>
      ) : (
        <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium" numberOfLines={1}>
            {title}
          </HeaderTitle>
          {!isFavorites ? (
            <Pressable
              hitSlop={12}
              onPress={() => {
                setDraftTitle(title);
                setRenaming(true);
              }}
              accessibilityLabel={t('albums.renameTitle')}
            >
              <Icon name="create-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <HeaderSpacer />
          )}
        </Header>
      )}

      {assets.length === 0 ? (
        <EmptyState
          icon={isFavorites ? 'heart-outline' : 'images-outline'}
          title={isFavorites ? t('album.emptyFavoritesTitle') : t('album.emptyTitle')}
          subtitle={
            isFavorites
              ? t('album.emptyFavoritesSubtitle')
              : t('album.emptySubtitle')
          }
        />
      ) : (
        <PhotoGrid
          assets={assets}
          context={viewerContext}
          albumId={albumId ?? undefined}
          stickyMonths={false}
        />
      )}

      {selectionActive ? (
        <SelectionBar
          count={selectedCount}
          onExit={() => useSelectionStore.getState().end()}
          actions={[
            { icon: 'share-outline', label: t('common.share'), onPress: () => void bulk.share() },
            { icon: 'heart-outline', label: t('selection.favorite'), onPress: bulk.favorite },
            ...(albumId
              ? [{ icon: 'remove-circle-outline' as const, label: t('album.removeFromAlbum'), onPress: bulk.removeFromAlbum }]
              : []),
            { icon: 'trash-outline', label: t('common.delete'), onPress: () => confirmDelete(), destructive: true },
          ]}
        />
      ) : null}

      <AlbumPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPicked={(album) => {
          const added = bulk.addToAlbum(album.id);
          setToast(added > 0 ? t('photos.addedToAlbum', { album: album.title }) : t('photos.alreadyInAlbum'));
        }}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );

  function confirmDelete() {
    Alert.alert(
      tCount('photos.deleteCountTitle', selectedCount, { count: selectedCount.toLocaleString(localeTag) }),
      t('photos.deleteWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            void bulk.remove().then((ok) => {
              if (!ok) setToast(t('photos.deleteFailed'));
            }),
        },
      ]
    );
  }
}
