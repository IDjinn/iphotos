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
  CellPlaceholder,
  CellPressable,
  CheckCircle,
  CheckWrap,
  DimLayer,
  Duration,
  MediaBadge,
  SyncBadge,
} from '@/components/grid/PhotoCell.styles';
import { getCachedCloudFileUri } from '@/data/cloud-media-cache';
import { useCloudThumbnailUri } from '@/hooks/use-cloud-file';
import { useIsOffline } from '@/hooks/use-net-info';
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

/** Device asset thumbnail: persistent generated thumbnail, original as fallback. */
function DeviceThumb({ asset }: { asset: PhotoAsset }) {
  const sourceUri = useThumbnailUri(asset);
  return (
    <CellImage
      source={{ uri: sourceUri }}
      contentFit="cover"
      transition={180}
      recyclingKey={asset.id}
      cachePolicy="memory-disk"
    />
  );
}

/** Cloud-only thumbnail: served from the persistent cloud cache, downloaded on first view. */
function CloudThumb({ asset }: { asset: PhotoAsset }) {
  const { colors } = useTheme();
  const offline = useIsOffline();
  const remote = useCloudThumbnailUri(asset.id);
  // Offline the hook never downloads — look the persistent cache up directly.
  const cachedUri = offline ? getCachedCloudFileUri(asset.id, 'thumbnail') : null;
  const source = offline ? (cachedUri ? { uri: cachedUri } : null) : remote;
  if (!source) {
    return (
      <CellPlaceholder>
        <Icon name="cloud-outline" size={18} color={colors.iconInactive} />
      </CellPlaceholder>
    );
  }
  return (
    <CellImage
      source={source}
      contentFit="cover"
      transition={180}
      recyclingKey={asset.id}
      cachePolicy="memory-disk"
    />
  );
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
  const cloudOnly = asset.syncState === 'cloud';

  return (
    <View ref={viewRef} collapsable={false} style={{ width: size, height: size }}>
      <DimLayer style={dimStyle}>
        <CellPressable
          onPress={() => onPress(asset)}
          onLongPress={() => {
            // Cloud-only items have no device file: device bulk actions don't apply.
            if (cloudOnly) return;
            haptic('medium');
            useSelectionStore.getState().begin(asset.id);
          }}
        >
          {cloudOnly ? <CloudThumb asset={asset} /> : <DeviceThumb asset={asset} />}
          {asset.syncState === 'local' ? (
            <SyncBadge pointerEvents="none" accessibilityLabel="Not backed up">
              <Icon name="cloud-offline-outline" size={12} color={colors.textInverse} />
            </SyncBadge>
          ) : null}
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
