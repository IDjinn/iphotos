import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useMemo, useRef } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { measureHeroCell } from '@/animations/hero';
import { buildGridData, type GridItem } from '@/data/grouping';
import type { PhotoAsset } from '@/data/types';
import { useSelectionStore } from '@/stores/selection';
import { useViewerStore, type ViewerContext } from '@/stores/viewer';
import { GRID_CELL_SIZE, GRID_COLUMNS, GRID_GAP } from '@/theme/tokens';
import { useTheme } from '@/theme/context';

import { DayHeader, GridRow, MonthHeader } from './GridHeaders';

interface PhotoGridProps {
  assets: PhotoAsset[];
  context: ViewerContext;
  albumId?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  stickyMonths?: boolean;
}

/**
 * The main photo grid: 3 columns, sticky month headers, day groups,
 * press → hero transition into the global viewer, long-press → selection.
 */
export function PhotoGrid({
  assets,
  context,
  albumId,
  onRefresh,
  refreshing = false,
  onEndReached,
  stickyMonths = true,
}: PhotoGridProps) {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<GridItem>>(null);
  const openViewer = useViewerStore((s) => s.open);

  const gridData = useMemo(() => buildGridData(assets, GRID_COLUMNS), [assets]);

  const onCellPress = useCallback(
    (asset: PhotoAsset) => {
      const selection = useSelectionStore.getState();
      if (selection.active) {
        selection.toggle(asset.id);
        return;
      }
      const index = assets.findIndex((a) => a.id === asset.id);
      if (index < 0) return;
      measureHeroCell(asset.id).then((origin) => {
        openViewer(assets, index, context, { albumId, origin });
      });
    },
    [assets, context, albumId, openViewer]
  );

  const renderItem = useCallback<ListRenderItem<GridItem>>(
    ({ item }) => {
      switch (item.kind) {
        case 'month':
          return (
            <MonthHeader
              label={item.label}
              onBackToTop={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            />
          );
        case 'day':
          return <DayHeader label={item.label} />;
        case 'row':
          return (
            <GridRow assets={item.assets} cellSize={GRID_CELL_SIZE} gap={GRID_GAP} onPress={onCellPress} />
          );
      }
    },
    [onCellPress]
  );

  return (
    <View style={styles.container}>
      <FlashList
        ref={listRef}
        data={gridData.items}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        stickyHeaderIndices={stickyMonths ? gridData.stickyIndices : undefined}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textSecondary}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
