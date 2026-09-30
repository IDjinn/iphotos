import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { SCREEN_HEIGHT, SCREEN_WIDTH, Springs } from '@/theme/tokens';

import { VideoPage } from './VideoPage';
import { useZoomController, ZoomableImage, type ZoomController } from './ZoomableImage';

const W = SCREEN_WIDTH;
const PAGE_WINDOW = 1;

/** 0 = undecided, 1 = horizontal swipe, 2 = vertical dismiss, 3 = zoom pan. */
const AXIS_NONE = 0;
const AXIS_HORIZONTAL = 1;
const AXIS_VERTICAL = 2;
const AXIS_ZOOM = 3;

interface ViewerPagerProps {
  assets: PhotoAsset[];
  index: number;
  onIndexChange: (index: number) => void;
  onDismiss: () => void;
  onTap: () => void;
  /** Dismiss drag state owned by the overlay so the close flight starts from it. */
  dismissTy: SharedValue<number>;
  dismissScale: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
  videoPlaying: boolean;
  videoMuted: boolean;
}

/** One page of the pager; registers its zoom controller with the pager. */
function PagerPage({
  asset,
  pageIndex,
  active,
  videoPlaying,
  videoMuted,
  pagerPan,
  onTap,
  onRegister,
}: {
  asset: PhotoAsset;
  pageIndex: number;
  active: boolean;
  videoPlaying: boolean;
  videoMuted: boolean;
  pagerPan: GestureType;
  onTap: () => void;
  onRegister: (index: number, controller: ZoomController | null) => void;
}) {
  const controller = useZoomController();

  useEffect(() => {
    onRegister(pageIndex, controller);
    return () => onRegister(pageIndex, null);
  }, [pageIndex, controller, onRegister]);

  return (
    <View style={[styles.page, { left: pageIndex * W }]}>
      {asset.mediaType === 'video' ? (
        <VideoPage
          asset={asset}
          active={active}
          playing={videoPlaying}
          muted={videoMuted}
          pagerPan={pagerPan}
          onTap={onTap}
        />
      ) : (
        <ZoomableImage asset={asset} controller={controller} pagerPan={pagerPan} onTap={onTap} />
      )}
    </View>
  );
}

/**
 * Gesture-driven pager: one pan gesture decides its axis once and then
 * either swipes pages, pans the zoomed image or drags the page down to
 * dismiss — fully interruptible, Google-Photos style.
 */
export function ViewerPager({
  assets,
  index,
  onIndexChange,
  onDismiss,
  onTap,
  dismissTy,
  dismissScale,
  backdropOpacity,
  videoPlaying,
  videoMuted,
}: ViewerPagerProps) {
  const offset = useSharedValue(-index * W);
  const axis = useSharedValue(AXIS_NONE);
  const baseOffset = useSharedValue(0);
  const baseZoomTx = useSharedValue(0);
  const baseZoomTy = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const controllers = useRef<Map<number, ZoomController>>(new Map());

  // Keep the container glued to the (possibly new) page without jumping.
  useEffect(() => {
    offset.value = -index * W;
    // Reset zoom on pages that are no longer active.
    controllers.current.forEach((controller, i) => {
      if (i !== index) controller.reset();
    });
  }, [index, offset]);

  const registerController = useMemo(
    () => (pageIndex: number, controller: ZoomController | null) => {
      if (controller) controllers.current.set(pageIndex, controller);
      else controllers.current.delete(pageIndex);
    },
    []
  );

  const pan = useMemo(() => {
    return Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .onStart((event) => {
        startTx.value = event.translationX;
        startTy.value = event.translationY;
        baseOffset.value = offset.value;
        const current = controllers.current.get(index);
        if (current) {
          baseZoomTx.value = current.tx.value;
          baseZoomTy.value = current.ty.value;
        }
      })
      .onUpdate((event) => {
        const dx = event.translationX - startTx.value;
        const dy = event.translationY - startTy.value;

        if (axis.value === AXIS_NONE) {
          const current = controllers.current.get(index);
          const zoomed = current ? current.scale.value > 1.01 : false;
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) && !zoomed) {
            axis.value = AXIS_HORIZONTAL;
          } else if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
            axis.value = zoomed ? AXIS_ZOOM : AXIS_VERTICAL;
          } else if (Math.abs(dx) > 12 && zoomed) {
            axis.value = AXIS_ZOOM;
          }
          return;
        }

        // Two-finger pinch in progress on the page — freeze the pager.
        const current = controllers.current.get(index);
        if (current && current.pinching.value) return;

        if (axis.value === AXIS_HORIZONTAL) {
          let raw = baseOffset.value + dx;
          const min = -(assets.length - 1) * W;
          const max = 0;
          if (raw > max) raw = max + (raw - max) * 0.3;
          if (raw < min) raw = min + (raw - min) * 0.3;
          offset.value = raw;
        } else if (axis.value === AXIS_VERTICAL) {
          dismissTy.value = dy;
          dismissScale.value = 1 - Math.min(Math.abs(dy) / 1400, 0.2);
          backdropOpacity.value = Math.max(0.15, 1 - Math.abs(dy) / 420);
        } else if (axis.value === AXIS_ZOOM && current) {
          current.tx.value = clamp(
            baseZoomTx.value + dx,
            -current.boundX.value,
            current.boundX.value
          );
          current.ty.value = clamp(
            baseZoomTy.value + dy,
            -current.boundY.value,
            current.boundY.value
          );
        }
      })
      .onEnd((event) => {
        const dx = event.translationX - startTx.value;
        const dy = event.translationY - startTy.value;

        if (axis.value === AXIS_HORIZONTAL) {
          const projected = -(baseOffset.value + dx + event.velocityX * 0.2) / W;
          const target = clamp(Math.round(projected), 0, assets.length - 1);
          offset.value = withSpring(-target * W, { velocity: event.velocityX, ...Springs.gentle }, (finished) => {
            if (finished) runOnJS(onIndexChange)(target);
          });
        } else if (axis.value === AXIS_VERTICAL) {
          if (dy > 130 || event.velocityY > 900) {
            runOnJS(onDismiss)();
          } else {
            dismissTy.value = withSpring(0, Springs.gentle);
            dismissScale.value = withSpring(1, Springs.gentle);
            backdropOpacity.value = withTiming(1, { duration: 180 });
          }
        }
        axis.value = AXIS_NONE;
      })
      .onFinalize(() => {
        axis.value = AXIS_NONE;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, assets.length, dismissTy, dismissScale, backdropOpacity, offset, onIndexChange, onDismiss]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { translateY: dismissTy.value },
      { scale: dismissScale.value },
    ],
  }));

  const window: number[] = [];
  for (let i = index - PAGE_WINDOW; i <= index + PAGE_WINDOW; i++) {
    if (i >= 0 && i < assets.length) window.push(i);
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.container, containerStyle]}>
        {window.map((i) => (
          <PagerPage
            key={assets[i].id}
            asset={assets[i]}
            pageIndex={i}
            active={i === index}
            videoPlaying={videoPlaying}
            videoMuted={videoMuted}
            pagerPan={pan}
            onTap={onTap}
            onRegister={registerController}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  page: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: W,
  },
});
