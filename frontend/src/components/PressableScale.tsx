import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable, type PressableProps } from 'react-native';

import { Springs } from '@/theme/tokens';
import { haptic } from '@/utils/haptics';

interface PressableScaleProps extends PressableProps {
  scaleTo?: number;
  children?: React.ReactNode;
}

/** Pressable that springs down slightly while touched. */
export function PressableScale({ scaleTo = 0.96, children, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
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
      </Pressable>
    </Animated.View>
  );
}
