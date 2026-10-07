import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BackHandler, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Backdrop,
  BackdropPressable,
  Handle,
  HandleWrap,
  Root,
  Sheet,
} from '@/components/BottomSheet.styles';
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
  const { space } = useTheme();
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
    <Root pointerEvents="box-none" {...containerProps}>
      <Backdrop entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)}>
        <BackdropPressable onPress={onClose} accessibilityLabel="Close sheet" />
      </Backdrop>
      <GestureDetector gesture={drag}>
        <Sheet
          entering={SlideInDown.springify().dampingRatio(0.85).stiffness(260)}
          exiting={SlideOutDown.duration(180)}
          style={sheetStyle}
          $maxHeight={`${Math.round(maxHeightFactor * 100)}%`}
          $paddingBottom={insets.bottom + space[3]}
        >
          <HandleWrap>
            <Handle />
          </HandleWrap>
          {children}
        </Sheet>
      </GestureDetector>
    </Root>
  );
}
