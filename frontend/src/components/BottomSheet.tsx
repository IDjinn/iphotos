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
  /** Fix the sheet at maxHeightFactor instead of letting it hug its content —
   * inner scroll views then get a definite height and virtualize properly. */
  fixedHeight?: boolean;
  containerProps?: ViewProps;
}

/**
 * Lightweight bottom sheet: spring slide-up, drag handle to dismiss,
 * tap backdrop to close, Android back button support.
 */
export function BottomSheet({ visible, onClose, children, maxHeightFactor = 0.7, fixedHeight = false, containerProps }: BottomSheetProps) {
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

  // Drag-to-dismiss lives on the handle only: a sheet-wide pan gesture steals
  // vertical drags from inner scroll views (the paged grids), which then can
  // never scroll. Backdrop tap and hardware back remain dismissal exits too.
  const drag = Gesture.Pan()
    .hitSlop({ top: space[2], bottom: space[2] })
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
      <Sheet
        entering={SlideInDown.springify().dampingRatio(0.85).stiffness(260)}
        exiting={SlideOutDown.duration(180)}
        style={sheetStyle}
        $maxHeight={`${Math.round(maxHeightFactor * 100)}%`}
        $height={fixedHeight ? `${Math.round(maxHeightFactor * 100)}%` : null}
        $paddingBottom={insets.bottom + space[3]}
      >
        <GestureDetector gesture={drag}>
          <HandleWrap>
            <Handle />
          </HandleWrap>
        </GestureDetector>
        {children}
      </Sheet>
    </Root>
  );
}
