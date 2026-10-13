import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

import { Durations } from '@/theme/tokens';
import { useTheme } from '@/theme/context';
import { PulseBox } from '@/components/skeleton/Skeleton.styles';

export type SkeletonRadius = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: SkeletonRadius;
  /** Stretch along the parent's main axis (grid cells, tracks). */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One loading placeholder block (state indication): a placeholder-colored
 * box breathing at opacity — opacity only, and static under reduced motion. */
export function Skeleton({ width, height, radius = 'md', fill = false, style }: SkeletonProps) {
  const { radius: radiusScale } = useTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.55, { duration: Durations.slow, easing: Easing.linear }),
      -1,
      true,
    );
  }, [pulse, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <PulseBox
      $width={width}
      $height={height}
      $radius={radiusScale[radius]}
      $fill={fill}
      style={[animatedStyle, style]}
    />
  );
}
