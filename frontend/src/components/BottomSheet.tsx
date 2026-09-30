import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BackHandler, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Springs } from '@/theme/tokens';
import { useTheme } from '@/theme/context';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  /** Max sheet height as a fraction of screen height. */
  maxHeightFactor?: number;
  containerProps?: ViewProps;
}

/**
 * Lightweight bottom sheet: spring slide-up, drag handle to dismiss,
 * tap backdrop to close, Android back button support.
 */
export function BottomSheet({ visible, onClose, children, maxHeightFactor = 0.7, containerProps }: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (visible) {
        onClose();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const drag = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, Springs.snappy);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} {...containerProps}>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View
          entering={SlideInDown.springify().dampingRatio(0.85).stiffness(260)}
          exiting={SlideOutDown.duration(180)}
          style={[
            styles.sheet,
            sheetStyle,
            {
              backgroundColor: colors.surfaceElevated,
              maxHeight: `${Math.round(maxHeightFactor * 100)}%`,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.outline }]} />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
