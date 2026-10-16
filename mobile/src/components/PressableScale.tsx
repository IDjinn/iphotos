import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable, type PressableProps } from 'react-native';

import { Springs } from '@/theme/tokens';
import { haptic } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  scaleTo?: number;
  children?: React.ReactNode;
  /** Reanimated entrance/exit — the shell renders as one Animated node. */
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
  exiting?: React.ComponentProps<typeof Animated.View>['exiting'];
}

/** Pressable that springs down slightly while touched. A single animated node
 * carries the styled shell: layout styles (flex: 1 in a row, height…) reach
 * the actual flex child, so shells keep their designed geometry. */
export function PressableScale({
  scaleTo = 0.96,
  children,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, Springs.snappy);
        haptic('selection');
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, Springs.gentle);
        onPressOut?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
