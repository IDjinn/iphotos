import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { registerHeroCell } from '@/animations/hero';
import { Icon } from '@/components/Icon';
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

  return (
    <View ref={viewRef} collapsable={false} style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
        <Pressable
          onPress={() => onPress(asset)}
          onLongPress={() => {
            haptic('medium');
            useSelectionStore.getState().begin(asset.id);
          }}
          style={StyleSheet.absoluteFill}
        >
          <Image
            source={{ uri: asset.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={180}
            recyclingKey={asset.id}
            cachePolicy="memory-disk"
          />
          {isVideo ? (
            <View style={styles.videoBadge} pointerEvents="none">
              <Icon name="play" size={14} color="#FFFFFF" />
            </View>
          ) : null}
          {isVideo && asset.duration ? (
            <Text style={styles.duration}>{formatDuration(asset.duration)}</Text>
          ) : null}
        </Pressable>
      </Animated.View>

      {selectionActive ? (
        <Animated.View style={[styles.checkWrap, checkStyle]} pointerEvents="none">
          <View
            style={[
              styles.checkCircle,
              {
                borderColor: colors.textInverse,
                backgroundColor: isSelected ? colors.accent : 'rgba(0,0,0,0.25)',
              },
            ]}
          >
            {isSelected ? <Icon name="checkmark" size={14} color="#0B0B0D" /> : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  checkWrap: { position: 'absolute', top: 6, right: 6, zIndex: 10 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    bottom: 4,
    left: 6,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
