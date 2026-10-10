import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
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

import { ZoomFill } from '@/components/viewer/ZoomableImage.styles';
import type { PhotoAsset } from '@/data/types';
import { Durations, Springs } from '@/theme/tokens';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/** Pinch shrink past 1× that commits the dismiss (iOS Photos turns the pinch into the close). */
export const DISMISS_COMMIT_SCALE = 0.92;
/** Pinch velocity (scale/s) considered a deliberate shrink. */
export const DISMISS_COMMIT_VELOCITY = -1;
/** Visual floor for the pinch-shrunk photo. */
export const PINCH_FLOOR = 0.45;

/** Pure dismiss-pinch commit decision — exported for unit tests. */
export function shouldCommitPinchDismiss(scale: number, velocity: number): boolean {
  return scale <= DISMISS_COMMIT_SCALE || velocity <= DISMISS_COMMIT_VELOCITY;
}

/**
 * Overlay-owned shared values a page drives while a pinch shrinks the photo
 * past 1× — the same channels the pull-down pan uses, so the close flight
 * starts from wherever the pinch released.
 */
export interface ViewerDismissDrivers {
  scale: SharedValue<number>;
  ty: SharedValue<number>;
  backdrop: SharedValue<number>;
  hideNeighbors: SharedValue<number>;
  trigger: () => void;
}

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
  /** Dismiss channels — present on photo pages only; without it a shrink
   *  pinch just clamps at 1× (video pages). */
  dismiss?: ViewerDismissDrivers | null;
  onTap: () => void;
}

/** "Contain" fit of an image inside the given viewport. */
export function containFit(width: number, height: number, viewW: number, viewH: number) {
  if (!(width > 0) || !(height > 0) || !(viewW > 0) || !(viewH > 0)) return { w: viewW, h: viewH };
  const aspect = width / height;
  let w = viewW;
  let h = w / aspect;
  if (h > viewH) {
    h = viewH;
    w = h * aspect;
  }
  return { w, h };
}

/**
 * Fullscreen pinch-to-zoom image. Single-finger pan while zoomed is
 * routed through the pager; this component owns pinch, double-tap and
 * tap-to-toggle-chrome.
 */
export function ZoomableImage({ asset, controller, pagerPan, dismiss, onTap }: ZoomableImageProps) {
  const { scale, tx, ty, boundX, boundY, pinching } = controller;
  const { width: viewW, height: viewH } = useWindowDimensions();
  const layout = useMemo(
    () => containFit(asset.width, asset.height, viewW, viewH),
    [asset.width, asset.height, viewW, viewH]
  );

  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  /** True once the active pinch shrank below 1× and became a dismiss. */
  const pinchDismiss = useSharedValue(false);

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      pinching.value = true;
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startFocalX.value = event.focalX;
      startFocalY.value = event.focalY;
      // Grabbing a dismiss pinch mid-return hands control straight back.
      pinchDismiss.value =
        dismiss !== null && dismiss !== undefined && dismiss.scale.value < 0.999;
    })
    .onUpdate((event) => {
      const raw = startScale.value * event.scale;
      if (raw >= 1 || dismiss === null || dismiss === undefined) {
        // Regular zoom (the photo crosses 1× continuously, so the handoff
        // from the dismiss branch below never jumps).
        pinchDismiss.value = false;
        const newScale = clamp(raw, 1, MAX_SCALE);
        const ratio = newScale / startScale.value;
        const bx = Math.max(0, (layout.w * newScale - viewW) / 2);
        const by = Math.max(0, (layout.h * newScale - viewH) / 2);
        scale.value = newScale;
        boundX.value = bx;
        boundY.value = by;
        // Keep the gesture's start focal point anchored on screen.
        tx.value = clamp(event.focalX - ratio * (startFocalX.value - startTx.value), -bx, bx);
        ty.value = clamp(event.focalY - ratio * (startFocalY.value - startTy.value), -by, by);
        return;
      }
      // iOS signature: shrinking past 1× turns the pinch into the dismiss —
      // the page scales down and the backdrop fades, on the same two fingers.
      pinchDismiss.value = true;
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
      boundX.value = 0;
      boundY.value = 0;
      dismiss.scale.value = Math.max(raw, PINCH_FLOOR);
      dismiss.ty.value = (event.focalY - startFocalY.value) * 0.5;
      dismiss.backdrop.value = Math.max(0.1, 1 - (1 - raw) * 1.5);
      dismiss.hideNeighbors.value = 1;
    })
    .onEnd((event) => {
      pinching.value = false;
      const raw = startScale.value * event.scale;
      if (pinchDismiss.value && dismiss !== null && dismiss !== undefined) {
        pinchDismiss.value = false;
        if (shouldCommitPinchDismiss(raw, event.velocity)) {
          // Close flight seeds from dismiss.scale/ty exactly as released.
          runOnJS(dismiss.trigger)();
          return;
        }
        dismiss.scale.value = withSpring(1, Springs.gentle);
        dismiss.ty.value = withSpring(0, Springs.gentle);
        dismiss.backdrop.value = withTiming(1, { duration: 180 });
        dismiss.hideNeighbors.value = 0;
        return;
      }
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
        const bx = Math.max(0, (layout.w * DOUBLE_TAP_SCALE - viewW) / 2);
        const by = Math.max(0, (layout.h * DOUBLE_TAP_SCALE - viewH) / 2);
        boundX.value = bx;
        boundY.value = by;
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: Durations.normal });
        tx.value = withTiming(
          clamp(-1.5 * (event.x - viewW / 2), -bx, bx),
          { duration: Durations.normal }
        );
        ty.value = withTiming(
          clamp(-1.5 * (event.y - viewH / 2), -by, by),
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
      <ZoomFill style={animatedStyle}>
        <Image
          source={{ uri: asset.uri, headers: asset.sourceHeaders }}
          style={{ width: layout.w, height: layout.h }}
          contentFit="contain"
          transition={120}
        />
      </ZoomFill>
    </GestureDetector>
  );
}
