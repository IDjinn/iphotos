import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { measureHeroCell } from '@/animations/hero';
import { buildGridData, type GridItem } from '@/data/grouping';
import {
  computeGridLayout,
  offsetForPhotoIndex,
  photoAnchorAtOffset,
} from '@/data/grid-metrics';
import type { PhotoAsset } from '@/data/types';
import { useSelectionStore } from '@/stores/selection';
import { useViewerStore, type ViewerContext } from '@/stores/viewer';
import { cellSizeFor, columnsFor } from '@/theme/scale';
import { GRID_GAP } from '@/theme/tokens';
import { useTheme } from '@/theme/context';

import { FastScroll, type FastScrollHandle } from './FastScroll';
import { DayHeader, GridRow, MonthHeader } from './GridHeaders';
import { dayHeaderHeight, monthHeaderHeight } from './GridHeaders.styles';
import { Grid } from './PhotoGrid.styles';
import { usePinchColumns } from './usePinchColumns';

interface PhotoGridProps {
  assets: PhotoAsset[];
  context: ViewerContext;
  albumId?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  stickyMonths?: boolean;
  /** Google-Photos-style month fast-scroll rail on the right edge. */
  fastScroll?: boolean;
  /** Overrides the default viewer open (e.g. decrypt-on-demand in encrypted mode). */
  onCellPress?: (asset: PhotoAsset) => void;
}

/**
 * The main photo grid: 3 columns, sticky month headers, day groups
 * (month-only past the one-month cutoff), press → hero transition into
 * the global viewer, long-press → selection, fast-scroll rail.
 */
export function PhotoGrid({
  assets,
  context,
  albumId,
  onRefresh,
  refreshing = false,
  onEndReached,
  stickyMonths = true,
  fastScroll = true,
  onCellPress,
}: PhotoGridProps) {
  const theme = useTheme();
  const listRef = useRef<FlashListRef<GridItem>>(null);
  const fastScrollRef = useRef<FastScrollHandle>(null);
  const scrollOffset = useSharedValue(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const openViewer = useViewerStore((s) => s.open);
  const { width } = useWindowDimensions();

  // Pinch-columns: on each step the first visible photo is captured as the
  // anchor (old layout) and re-scrolled to its new row offset (new layout),
  // so the grid keeps its place when rows re-batch.
  const anchorRef = useRef<number | null>(null);
  const onStepRef = useRef<(next: number) => void>(() => {});
  const { columns, gesture: pinchGesture } = usePinchColumns(columnsFor(width), {
    onStep: (next) => onStepRef.current(next),
  });
  const cellSize = cellSizeFor(width, columns, GRID_GAP);

  const gridData = useMemo(() => buildGridData(assets, columns), [assets, columns]);

  const gridLayout = useMemo(
    () =>
      computeGridLayout(gridData.items, {
        monthHeaderHeight: monthHeaderHeight(theme),
        dayHeaderHeight: dayHeaderHeight(theme),
        rowHeight: cellSize + GRID_GAP,
      }),
    [gridData, cellSize, theme]
  );

  useEffect(() => {
    onStepRef.current = () => {
      anchorRef.current = photoAnchorAtOffset(gridData.items, gridLayout, scrollOffset.value);
    };
  }, [gridData, gridLayout, scrollOffset]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    anchorRef.current = null;
    listRef.current?.scrollToOffset({
      offset: offsetForPhotoIndex(gridData.items, gridLayout, anchor),
      animated: false,
    });
  }, [columns, gridData, gridLayout]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);

  const scrollToOffset = useCallback((offset: number, animated: boolean) => {
    listRef.current?.scrollToOffset({ offset, animated });
  }, []);

  const defaultCellPress = useCallback(
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

  const handleCellPress = useCallback(
    (asset: PhotoAsset) => {
      if (onCellPress) onCellPress(asset);
      else defaultCellPress(asset);
    },
    [onCellPress, defaultCellPress]
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
            <GridRow assets={item.assets} cellSize={cellSize} gap={GRID_GAP} onPress={handleCellPress} />
          );
      }
    },
    [handleCellPress, cellSize]
  );

  return (
    <Grid onLayout={handleLayout}>
      <GestureDetector gesture={pinchGesture}>
        <FlashList
          ref={listRef}
          data={gridData.items}
          renderItem={renderItem}
          extraData={cellSize}
          keyExtractor={(item) => item.key}
          stickyHeaderIndices={stickyMonths ? gridData.stickyIndices : undefined}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollOffset.value = e.nativeEvent.contentOffset.y;
            fastScrollRef.current?.reveal();
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.textSecondary}
                progressBackgroundColor={theme.colors.surface}
              />
            ) : undefined
          }
        />
      </GestureDetector>
      {fastScroll && viewportHeight > 0 ? (
        <FastScroll
          ref={fastScrollRef}
          metrics={gridLayout}
          viewportHeight={viewportHeight}
          scrollOffset={scrollOffset}
          scrollToOffset={scrollToOffset}
        />
      ) : null}
    </Grid>
  );
}
