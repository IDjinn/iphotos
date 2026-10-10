import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { registerHeroCell } from '@/animations/hero';
import { Icon } from '@/components/Icon';
import {
  CellImage,
  CellPressable,
  CheckCircle,
  CheckWrap,
  DimLayer,
  Duration,
  MediaBadge,
} from '@/components/grid/PhotoCell.styles';
import { useThumbnailUri } from '@/hooks/use-thumbnail-uri';
import { useSelectionStore } from '@/stores/selection';
import { Springs } from '@/theme/tokens';
import { useTheme } from '@/theme/context';
import type { PhotoAsset } from '@/data/types';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

interface PhotoCellProps {
  asset: PhotoAsset;
  size: number;
  onPress: (asset: PhotoAsset) => void;
}

/**
 * Square grid cell. Registers itself in the hero registry so the
 * viewer can fly out of / back into its exact on-screen frame.
 */
export function PhotoCell({ asset, size, onPress }: PhotoCellProps) {
  const { colors } = useTheme();
  const viewRef = useRef<View>(null);
  const selectionActive = useSelectionStore((s) => s.active);
  const isSelected = useSelectionStore((s) => s.idSet.has(asset.id));
  const checkScale = useSharedValue(0);

  useEffect(() => registerHeroCell(asset.id, viewRef), [asset.id]);

  useEffect(() => {
    checkScale.value = isSelected
      ? withDelay(30, withSpring(1, Springs.bouncy))
      : withTiming(0, { duration: 120 });
  }, [isSelected, checkScale]);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: selectionActive && !isSelected ? 0.45 : 1,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const isVideo = asset.mediaType === 'video';
  const isLive = !isVideo && asset.isLive === true;
  const sourceUri = useThumbnailUri(asset);

  return (
    <View ref={viewRef} collapsable={false} style={{ width: size, height: size }}>
      <DimLayer style={dimStyle}>
        <CellPressable
          onPress={() => onPress(asset)}
          onLongPress={() => {
            haptic('medium');
            useSelectionStore.getState().begin(asset.id);
          }}
        >
          <CellImage
            source={{ uri: sourceUri }}
            contentFit="cover"
            transition={180}
            recyclingKey={asset.id}
            cachePolicy="memory-disk"
          />
          {isVideo || isLive ? (
            <MediaBadge pointerEvents="none">
              <Icon
                name={isVideo ? 'play' : 'radio-button-on'}
                size={14}
                color={colors.textInverse}
              />
            </MediaBadge>
          ) : null}
          {isVideo && asset.duration ? (
            <Duration>{formatDuration(asset.duration)}</Duration>
          ) : null}
        </CellPressable>
      </DimLayer>

      {selectionActive ? (
        <CheckWrap style={checkStyle} pointerEvents="none">
          <CheckCircle $selected={isSelected}>
            {isSelected ? <Icon name="checkmark" size={14} color={colors.onAccent} /> : null}
          </CheckCircle>
        </CheckWrap>
      ) : null}
    </View>
  );
}
