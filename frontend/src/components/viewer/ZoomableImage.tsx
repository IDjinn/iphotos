import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { PhotoAsset } from '@/data/types';
import { Durations, SCREEN_HEIGHT, SCREEN_WIDTH, Springs } from '@/theme/tokens';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/** Zoom state owned by a page; the pager drives single-finger pan. */
export interface ZoomController {
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  boundX: SharedValue<number>;
  boundY: SharedValue<number>;
  /** True while a two-finger pinch is active — the pager freezes. */
  pinching: SharedValue<boolean>;
  /** JS-side reset (page change, close). */
  reset: () => void;
}

export function useZoomController(): ZoomController {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const boundX = useSharedValue(0);
  const boundY = useSharedValue(0);
  const pinching = useSharedValue(false);

  const reset = useCallback(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
  }, [scale, tx, ty]);

  return useMemo(
    () => ({ scale, tx, ty, boundX, boundY, pinching, reset }),
    [scale, tx, ty, boundX, boundY, pinching, reset]
  );
}

interface ZoomableImageProps {
  asset: PhotoAsset;
  controller: ZoomController;
  /** The pager's pan gesture, registered as simultaneous so pinch + swipe coexist. */
  pagerPan?: GestureType | null;
  onTap: () => void;
}

/** "Contain" fit of an image inside the viewport. */
export function containFit(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
  const aspect = width / height;
  let w = SCREEN_WIDTH;
  let h = w / aspect;
  if (h > SCREEN_HEIGHT) {
    h = SCREEN_HEIGHT;
    w = h * aspect;
  }
  return { w, h };
}

/**
 * Fullscreen pinch-to-zoom image. Single-finger pan while zoomed is
 * routed through the pager; this component owns pinch, double-tap and
 * tap-to-toggle-chrome.
 */
export function ZoomableImage({ asset, controller, pagerPan, onTap }: ZoomableImageProps) {
  const { scale, tx, ty, boundX, boundY, pinching } = controller;
  const layout = useMemo(() => containFit(asset.width, asset.height), [asset.width, asset.height]);

  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      pinching.value = true;
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startFocalX.value = event.focalX;
      startFocalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const newScale = clamp(startScale.value * event.scale, 1, MAX_SCALE);
      const ratio = newScale / startScale.value;
      const bx = Math.max(0, (layout.w * newScale - SCREEN_WIDTH) / 2);
      const by = Math.max(0, (layout.h * newScale - SCREEN_HEIGHT) / 2);
      scale.value = newScale;
      boundX.value = bx;
      boundY.value = by;
      // Keep the gesture's start focal point anchored on screen.
      tx.value = clamp(event.focalX - ratio * (startFocalX.value - startTx.value), -bx, bx);
      ty.value = clamp(event.focalY - ratio * (startFocalY.value - startTy.value), -by, by);
    })
    .onEnd(() => {
      pinching.value = false;
      if (scale.value < 1.02) {
        scale.value = withSpring(1, Springs.gentle);
        tx.value = withSpring(0, Springs.gentle);
        ty.value = withSpring(0, Springs.gentle);
        boundX.value = 0;
        boundY.value = 0;
      }
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1.01) {
        scale.value = withSpring(1, Springs.gentle);
        tx.value = withSpring(0, Springs.gentle);
        ty.value = withSpring(0, Springs.gentle);
        boundX.value = 0;
        boundY.value = 0;
      } else {
        const bx = Math.max(0, (layout.w * DOUBLE_TAP_SCALE - SCREEN_WIDTH) / 2);
        const by = Math.max(0, (layout.h * DOUBLE_TAP_SCALE - SCREEN_HEIGHT) / 2);
        boundX.value = bx;
        boundY.value = by;
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: Durations.normal });
        tx.value = withTiming(
          clamp(-1.5 * (event.x - SCREEN_WIDTH / 2), -bx, bx),
          { duration: Durations.normal }
        );
        ty.value = withTiming(
          clamp(-1.5 * (event.y - SCREEN_HEIGHT / 2), -by, by),
          { duration: Durations.normal }
        );
      }
    });

  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      runOnJS(onTap)();
    });

  // Relationships with the pager's pan are declared on the inner gestures
  // (composed gestures don't expose the composition builder methods).
  const composed = useMemo(() => {
    if (pagerPan) {
      pinch.simultaneousWithExternalGesture(pagerPan);
      doubleTap.simultaneousWithExternalGesture(pagerPan);
      singleTap.simultaneousWithExternalGesture(pagerPan);
    }
    return Gesture.Simultaneous(pinch, doubleTap, singleTap);
  }, [pinch, doubleTap, singleTap, pagerPan]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.fill, animatedStyle]}>
        <Image
          source={{ uri: asset.uri }}
          style={{ width: layout.w, height: layout.h }}
          contentFit="contain"
          transition={120}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
