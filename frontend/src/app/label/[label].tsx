import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, FadeOut } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { SelectionBar } from '@/components/SelectionBar';
import { ThemedText } from '@/components/ThemedText';
import {
  Center,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Meta,
  Screen,
} from '@/app/label/[label].styles';
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
      <Center $insetTop={insets.top}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Center>
    );
  }

  return (
    <Screen $insetTop={insets.top}>
      {selectionActive ? (
        <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Pressable hitSlop={12} onPress={() => useSelectionStore.getState().end()} accessibilityLabel="Exit selection">
            <Icon name="close" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium">{selectedCount} selected</HeaderTitle>
          <HeaderSpacer />
        </Header>
      ) : (
        <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium" numberOfLines={1}>
            {title}
          </HeaderTitle>
          <HeaderSpacer />
        </Header>
      )}

      {assets.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="No photos with this label"
          subtitle="Items carrying it may have been removed from this device."
        />
      ) : (
        <>
          <Meta>
            <ThemedText variant="bodySmall" color="secondary">
              {assets.length.toLocaleString('en-US')} item{assets.length === 1 ? '' : 's'}
            </ThemedText>
          </Meta>
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
    </Screen>
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
