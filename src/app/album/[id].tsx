import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { SelectionBar } from '@/components/SelectionBar';
import { AlbumPickerSheet } from '@/components/AlbumPickerSheet';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { createAlbum, getAlbum, getAlbumAssetIds, renameAlbum } from '@/data/albums-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import { listFavoriteIds } from '@/data/favorites-repository';
import type { PhotoAsset } from '@/data/types';
import { useBulkActions } from '@/hooks/use-bulk-actions';
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

  const isFavorites = id === FAVORITES_ID;
  const isNew = id === 'new';

  const [title, setTitle] = useState(isFavorites ? 'Favorites' : '');
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
      setTitle('Favorites');
    } else if (id) {
      const album = getAlbum(id);
      setTitle(album?.title ?? 'Album');
      const items = await fetchAssetsByIds(getAlbumAssetIds(id));
      setAssets(items);
    }
    setLoading(false);
  }, [id, isFavorites, isNew]);

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
    setToast('Album renamed');
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // ----- Create-album flow -----
  if (isNew) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Cancel">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium">New album</ThemedText>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.createWrap}>
          <TextInput
            autoFocus
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Album title"
            placeholderTextColor={colors.textDisabled}
            style={[styles.createInput, { color: colors.text, borderColor: colors.outline }]}
            onSubmitEditing={() => createNew(draftTitle)}
            maxLength={60}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.createButton, { backgroundColor: draftTitle.trim() ? colors.accent : colors.surface }]}
            disabled={!draftTitle.trim()}
            onPress={() => createNew(draftTitle)}
          >
            <ThemedText variant="body" color={draftTitle.trim() ? 'inverse' : 'secondary'}>
              Create
            </ThemedText>
          </Pressable>
          <ThemedText variant="bodySmall" color="secondary" style={styles.createHint}>
            After creating, use selection mode on the Photos tab to add items.
          </ThemedText>
        </View>
      </View>
    );
  }

  // ----- Album detail -----
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renaming ? (
        <Animated.View entering={FadeIn.duration(150)} style={styles.header}>
          <Pressable hitSlop={12} onPress={() => setRenaming(false)} accessibilityLabel="Cancel rename">
            <Icon name="close" size={22} />
          </Pressable>
          <TextInput
            autoFocus
            value={draftTitle}
            onChangeText={setDraftTitle}
            style={[styles.renameInput, { color: colors.text, borderColor: colors.accent }]}
            onSubmitEditing={handleRename}
            maxLength={60}
          />
          <Pressable hitSlop={12} onPress={handleRename} accessibilityLabel="Confirm rename">
            <Icon name="checkmark" size={24} color={colors.accent} />
          </Pressable>
        </Animated.View>
      ) : selectionActive ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.header}>
          <Pressable hitSlop={12} onPress={() => useSelectionStore.getState().end()} accessibilityLabel="Exit selection">
            <Icon name="close" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium" style={styles.headerTitle}>
            {selectedCount} selected
          </ThemedText>
          <View style={{ width: 24 }} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium" style={styles.headerTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          {!isFavorites ? (
            <Pressable
              hitSlop={12}
              onPress={() => {
                setDraftTitle(title);
                setRenaming(true);
              }}
              accessibilityLabel="Rename album"
            >
              <Icon name="create-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </Animated.View>
      )}

      {assets.length === 0 ? (
        <EmptyState
          icon={isFavorites ? 'heart-outline' : 'images-outline'}
          title={isFavorites ? 'No favorites yet' : 'This album is empty'}
          subtitle={
            isFavorites
              ? 'Tap the heart on any photo to see it here.'
              : 'Select photos on the Photos tab and use “Add to album”.'
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
            { icon: 'share-outline', label: 'Share', onPress: () => void bulk.share() },
            { icon: 'heart-outline', label: 'Favorite', onPress: bulk.favorite },
            ...(albumId
              ? [{ icon: 'remove-circle-outline' as const, label: 'Remove from album', onPress: bulk.removeFromAlbum }]
              : []),
            { icon: 'trash-outline', label: 'Delete', onPress: () => confirmDelete(), destructive: true },
          ]}
        />
      ) : null}

      <AlbumPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPicked={(album) => {
          const added = bulk.addToAlbum(album.id);
          setToast(added > 0 ? `Added to ${album.title}` : 'Already in that album');
        }}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </View>
  );

  function confirmDelete() {
    Alert.alert(
      `Delete ${selectedCount} item${selectedCount === 1 ? '' : 's'} from device?`,
      'They will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void bulk.remove().then((ok) => {
              if (!ok) setToast('Could not delete — permission denied');
            }),
        },
      ]
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: 52,
  },
  headerTitle: { flex: 1, fontWeight: '600' },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '500',
  },
  createWrap: { padding: 20, gap: 12 },
  createInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  createButton: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  createHint: { textAlign: 'center', paddingTop: 4 },
});
