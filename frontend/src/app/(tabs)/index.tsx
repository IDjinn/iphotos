import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PermissionGate } from '@/components/PermissionGate';
import { SelectionBar } from '@/components/SelectionBar';
import { AlbumPickerSheet } from '@/components/AlbumPickerSheet';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { useBulkActions } from '@/hooks/use-bulk-actions';
import { useGalleryFeed } from '@/hooks/use-gallery-feed';
import { useSelectionStore } from '@/stores/selection';
import { useTheme } from '@/theme/context';

/**
 * Photos tab: the main timeline grid with month/day sections,
 * selection mode and all bulk actions.
 */
export default function PhotosScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assets, permission, loading, refreshing, loadMore, refresh, askPermission } = useGalleryFeed();

  const selectionActive = useSelectionStore((s) => s.active);
  const selectedCount = useSelectionStore((s) => s.ids.length);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const shownAssets = useMemo(() => assets.filter((a) => !removedIds.has(a.id)), [assets, removedIds]);

  const bulk = useBulkActions({
    assets,
    applyRemovals: (ids) => setRemovedIds((prev) => new Set([...prev, ...ids])),
  });

  const handleLock = async () => {
    const message = await bulk.toggleLocked();
    if (!message) return;
    setToast(message === 'SETUP_REQUIRED' ? 'Set up your Locked Folder first' : message);
    if (message === 'SETUP_REQUIRED') router.push('/locked');
  };

  const handleDelete = () => {
    Alert.alert(
      `Delete ${selectedCount} item${selectedCount === 1 ? '' : 's'} from device?`,
      'They will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void bulk.remove().then((ok) => {
              if (!ok) setToast('Could not delete — permission denied');
              else setRemovedIds(new Set());
            });
          },
        },
      ]
    );
  };

  if (permission === 'unknown' || (loading && assets.length === 0 && removedIds.size === 0)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (permission === 'denied' || permission === 'limited') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <PermissionGate status={permission} onRequest={askPermission} />
      </View>
    );
  }

  if (shownAssets.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <ThemedText variant="display">iPhotos</ThemedText>
        </View>
        <EmptyState
          icon="images-outline"
          title="No photos yet"
          subtitle="Photos and videos on this device will show up here."
        />
      </View>
    );
  }

  return (
    <TabSwipe tab="/">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header — crossfades between normal and selection mode. */}
        {selectionActive ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.header}>
            <Pressable hitSlop={12} onPress={() => useSelectionStore.getState().end()} accessibilityLabel="Exit selection">
              <Icon name="close" size={24} />
            </Pressable>
            <ThemedText variant="titleMedium" style={styles.headerTitle}>
              {selectedCount} selected
            </ThemedText>
            <Pressable
              hitSlop={12}
              onPress={() => useSelectionStore.getState().selectMany(shownAssets.map((a) => a.id))}
              accessibilityLabel="Select all"
            >
              <Icon name="checkmark-circle-outline" size={24} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.header}>
            <ThemedText variant="display">iPhotos</ThemedText>
            <Pressable hitSlop={12} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
              <Icon name="settings-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </Animated.View>
        )}

        <PhotoGrid
          assets={shownAssets}
          context="gallery"
          onRefresh={() => {
            setRemovedIds(new Set());
            return refresh();
          }}
          refreshing={refreshing}
          onEndReached={() => void loadMore()}
        />

        {selectionActive ? (
          <SelectionBar
            count={selectedCount}
            onExit={() => useSelectionStore.getState().end()}
            actions={[
              { icon: 'share-outline', label: 'Share', onPress: () => void bulk.share() },
              { icon: 'heart-outline', label: 'Favorite', onPress: bulk.favorite },
              { icon: 'images-outline', label: 'Add to album', onPress: () => setPickerVisible(true) },
              { icon: 'lock-closed-outline', label: 'Lock', onPress: () => void handleLock() },
              { icon: 'trash-outline', label: 'Delete', onPress: handleDelete, destructive: true },
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
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: 52,
  },
  headerTitle: { fontWeight: '600' },
});
