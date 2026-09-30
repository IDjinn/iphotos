import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { SelectionBar } from '@/components/SelectionBar';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { getLabelAssetIds } from '@/data/labels-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import type { PhotoAsset } from '@/data/types';
import { useBulkActions } from '@/hooks/use-bulk-actions';
import { useSelectionStore } from '@/stores/selection';
import { useTheme } from '@/theme/context';

/**
 * Album-style view of every photo carrying one label. Unlike label search
 * (capped at 200 results), this resolves the full id list from the label
 * index, newest first.
 */
export default function LabelAlbumScreen() {
  const { label } = useLocalSearchParams<{ label: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const selectionActive = useSelectionStore((s) => s.active);
  const selectedCount = useSelectionStore((s) => s.ids.length);

  const title = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Label';

  const load = useCallback(async () => {
    if (!label) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const items = await fetchAssetsByIds(getLabelAssetIds(label));
    items.sort((a, b) => b.creationTime - a.creationTime);
    setAssets(items);
    setLoading(false);
  }, [label]);

  useEffect(() => {
    void load();
  }, [load]);

  const bulk = useBulkActions({
    assets,
    applyRemovals: (ids) => setAssets((prev) => prev.filter((a) => !ids.includes(a.id))),
  });

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {selectionActive ? (
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
          <View style={{ width: 24 }} />
        </Animated.View>
      )}

      {assets.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="No photos with this label"
          subtitle="Items carrying it may have been removed from this device."
        />
      ) : (
        <>
          <View style={styles.meta}>
            <ThemedText variant="bodySmall" color="secondary">
              {assets.length.toLocaleString('en-US')} item{assets.length === 1 ? '' : 's'}
            </ThemedText>
          </View>
          <PhotoGrid assets={assets} context="search" stickyMonths={false} />
        </>
      )}

      {selectionActive ? (
        <SelectionBar
          count={selectedCount}
          onExit={() => useSelectionStore.getState().end()}
          actions={[
            { icon: 'share-outline', label: 'Share', onPress: () => void bulk.share() },
            { icon: 'heart-outline', label: 'Favorite', onPress: bulk.favorite },
            { icon: 'trash-outline', label: 'Delete', onPress: () => confirmDelete(), destructive: true },
          ]}
        />
      ) : null}

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
  meta: { paddingHorizontal: 16, paddingBottom: 8 },
});
