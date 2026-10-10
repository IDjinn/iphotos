import { useEffect, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Page, PagerContainer } from '@/components/viewer/ViewerPager.styles';
import type { PhotoAsset } from '@/data/types';
import { Springs } from '@/theme/tokens';

import { VideoPage } from './VideoPage';
import {
  useZoomController,
  ZoomableImage,
  type ViewerDismissDrivers,
  type ZoomController,
} from './ZoomableImage';

const PAGE_WINDOW = 1;

/** 0 = undecided, 1 = horizontal page swipe, 2 = pull-down dismiss, 3 = zoom pan. */
const MODE_NONE = 0;
const MODE_PAGE = 1;
const MODE_DISMISS = 2;
const MODE_ZOOM = 3;

/** Zoomed-pan overflow that turns the page on release. */
const EDGE_COMMIT_RATIO = 0.2;
/** Minimum overflow (dp) for the velocity-based page commit. */
const EDGE_COMMIT_MIN = 24;
/** Horizontal velocity (dp/s) that commits the page from a smaller overflow. */
const EDGE_COMMIT_VELOCITY = 600;
/** How much of the past-the-edge drag carries into the pager offset. */
const EDGE_RESISTANCE = 0.35;
/** Rubber-band factor at the first/last page (no neighbour to carry into). */
const EDGE_RUBBER = 0.15;

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
  /** Pager x-offset and tilt, owned by the overlay so the close flight can
   *  start from the exact rect the photo was released at. */
  offset: SharedValue<number>;
  rotation: SharedValue<number>;
  videoPlaying: boolean;
  videoMuted: boolean;
  /** Whether the overlay chrome is showing — video pages mirror it on the scrubber. */
  chromeVisible: boolean;
}

/** One page of the pager; registers its zoom controller with the pager. */
function PagerPage({
  asset,
  pageIndex,
  pageWidth,
  active,
  videoPlaying,
  videoMuted,
  chromeVisible,
  pagerPan,
  hideNeighbors,
  dismissTy,
  dismissScale,
  rotation,
  dismiss,
  onTap,
  onRegister,
}: {
  asset: PhotoAsset;
  pageIndex: number;
  pageWidth: number;
  active: boolean;
  videoPlaying: boolean;
  videoMuted: boolean;
  chromeVisible: boolean;
  pagerPan: GestureType;
  hideNeighbors: SharedValue<number>;
  dismissTy: SharedValue<number>;
  dismissScale: SharedValue<number>;
  rotation: SharedValue<number>;
  dismiss: ViewerDismissDrivers;
  onTap: () => void;
  onRegister: (index: number, controller: ZoomController | null) => void;
}) {
  const controller = useZoomController();

  useEffect(() => {
    onRegister(pageIndex, controller);
    return () => onRegister(pageIndex, null);
  }, [pageIndex, controller, onRegister]);

  // The dismiss transform lives on each PAGE, not on the pager container:
  // RN scales around the element's layout centre, and the container's centre
  // sits a full page away from photo N — scaling there dragged the photo
  // sideways (left) in proportion to its index during the pull-down. Each
  // page scales around its own centre, where the photo actually is.
  const pageMotion = useAnimatedStyle(() => ({
    opacity: active ? 1 : 1 - hideNeighbors.value,
    transform: [
      { translateY: dismissTy.value },
      { scale: dismissScale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <Page $left={pageIndex * pageWidth} $width={pageWidth} style={pageMotion}>
      {asset.mediaType === 'video' ? (
        <VideoPage
          asset={asset}
          active={active}
          playing={videoPlaying}
          muted={videoMuted}
          chromeVisible={chromeVisible}
          pagerPan={pagerPan}
          onTap={onTap}
        />
      ) : (
        <ZoomableImage
          asset={asset}
          controller={controller}
          pagerPan={pagerPan}
          dismiss={dismiss}
          onTap={onTap}
        />
      )}
    </Page>
  );
}

/**
 * Gesture-driven pager in the iOS Photos mould: the mode (page / dismiss /
 * zoom) is re-evaluated on every frame with hysteresis instead of locking an
 * axis once, so a diagonal drag always reads as the dominant direction —
 * pull-downs track the finger on both axes (neighbours hidden) and release
 * into the grid, horizontal swipes page with a snappy settle.
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
  offset,
  rotation,
  videoPlaying,
  videoMuted,
  chromeVisible,
}: ViewerPagerProps) {
  const { width: pageWidth } = useWindowDimensions();
  const mode = useSharedValue(MODE_NONE);
  /** Page the active gesture is anchored on, captured at mode entry — worklets
   *  must never do math on the `index` prop: a fast flick leaves the closure
   *  stale, and settles would fly back to the wrong page. */
  const homePage = useSharedValue(index);
  /** True once onEnd ran — lets onFinalize tell a cancel apart from a normal finish. */
  const ended = useSharedValue(false);
  const baseOffset = useSharedValue(0);
  const baseZoomTx = useSharedValue(0);
  const baseZoomTy = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  /** 1 while a pull-down is in flight — fades non-current pages out. */
  const hideNeighbors = useSharedValue(0);
  const controllers = useRef<Map<number, ZoomController>>(new Map());

  // Reconcile the container with external index changes (delete, setIndex) or
  // a window resize. Self-driven changes retarget the very same flight spring
  // — it restarts from the current position, so the glide is never cancelled.
  // (A JS ref set from a worklet does not sync back to the JS thread, so the
  // old flag-based "skip" here silently killed every paging animation.)
  useEffect(() => {
    if (mode.value === MODE_NONE) {
      offset.value = withSpring(-index * pageWidth, Springs.slide);
    }
    // Reset zoom on pages that are no longer active.
    controllers.current.forEach((controller, i) => {
      if (i !== index) controller.reset();
    });
  }, [index, pageWidth, offset, mode]);

  const registerController = useMemo(
    () => (pageIndex: number, controller: ZoomController | null) => {
      if (controller) controllers.current.set(pageIndex, controller);
      else controllers.current.delete(pageIndex);
    },
    []
  );

  /** Shrink-pinch dismiss channels, handed to every photo page. */
  const dismiss = useMemo<ViewerDismissDrivers>(
    () => ({
      scale: dismissScale,
      ty: dismissTy,
      backdrop: backdropOpacity,
      hideNeighbors,
      trigger: onDismiss,
    }),
    [dismissScale, dismissTy, backdropOpacity, hideNeighbors, onDismiss]
  );

  const pan = useMemo(() => {
    // Clear any half-settled pull-down state: an interrupted spring-back
    // (user grabbed the page mid-return) otherwise leaves rotation, scale,
    // backdrop dim and hidden neighbours stuck into the next gesture.
    const settleDismiss = () => {
      'worklet';
      cancelAnimation(dismissTy);
      dismissTy.value = withSpring(0, Springs.gentle);
      cancelAnimation(dismissScale);
      dismissScale.value = withSpring(1, Springs.gentle);
      cancelAnimation(rotation);
      rotation.value = withSpring(0, Springs.snappy);
      backdropOpacity.value = withTiming(1, { duration: 180 });
      hideNeighbors.value = 0;
    };

    return Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .onStart((event) => {
        startTx.value = event.translationX;
        startTy.value = event.translationY;
        ended.value = false;
        baseOffset.value = offset.value;
      })
      .onUpdate((event) => {
        const dx = event.translationX - startTx.value;
        const dy = event.translationY - startTy.value;

        if (mode.value === MODE_NONE) {
          // A flight spring from the previous swipe may still be running —
          // take over from wherever the pager currently is.
          cancelAnimation(offset);
          baseOffset.value = offset.value;
          homePage.value = clamp(
            Math.round(-baseOffset.value / pageWidth),
            0,
            assets.length - 1
          );
          const current = controllers.current.get(homePage.value);
          const zoomed = current ? current.scale.value > 1.01 : false;
          if (zoomed && current) {
            mode.value = MODE_ZOOM;
            baseZoomTx.value = current.tx.value;
            baseZoomTy.value = current.ty.value;
          } else if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
            mode.value = MODE_DISMISS;
          } else if (Math.abs(dx) > 10) {
            mode.value = MODE_PAGE;
          } else {
            return;
          }
          if (mode.value === MODE_DISMISS) {
            cancelAnimation(dismissTy);
            cancelAnimation(dismissScale);
            hideNeighbors.value = 1;
          } else {
            settleDismiss();
          }
        } else if (mode.value === MODE_PAGE && dy > 24 && dy > Math.abs(dx) * 1.2) {
          // Mid-gesture handoff: a horizontal swipe that turned into a
          // pull-down — iOS Photos switches modes just as fluidly.
          mode.value = MODE_DISMISS;
          hideNeighbors.value = 1;
          cancelAnimation(dismissTy);
          cancelAnimation(dismissScale);
        } else if (mode.value === MODE_DISMISS && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          // ...and back: a pull-down that turned into a horizontal swipe.
          mode.value = MODE_PAGE;
          settleDismiss();
        }

        // Two-finger pinch in progress on the page — freeze the pager.
        const current = controllers.current.get(homePage.value);
        if (current && current.pinching.value) return;

        if (mode.value === MODE_PAGE) {
          let raw = baseOffset.value + dx;
          const min = -(assets.length - 1) * pageWidth;
          const max = 0;
          if (raw > max) raw = max + (raw - max) * 0.3;
          if (raw < min) raw = min + (raw - min) * 0.3;
          offset.value = raw;
        } else if (mode.value === MODE_DISMISS) {
          // iOS-Photos pull-down: the photo tracks the finger on both axes —
          // neighbours are hidden, so the diagonal follow never reveals one.
          // Both vertical directions follow 1:1 and can dismiss.
          offset.value = baseOffset.value + dx;
          dismissTy.value = dy;
          dismissScale.value = 1 - Math.min(Math.abs(dy) / 1200, 0.22);
          backdropOpacity.value = Math.max(0.15, 1 - Math.abs(dy) / 420);
          rotation.value = clamp(dx / pageWidth, -1, 1) * 8;
        } else if (mode.value === MODE_ZOOM && current) {
          // Zoomed pan: the photo moves inside its bounds; dragging past a
          // horizontal edge carries the overflow into the pager offset (iOS
          // Photos turns the same drag into a page change on release).
          const nx = baseZoomTx.value + dx;
          const ny = baseZoomTy.value + dy;
          const overX = Math.abs(nx) - current.boundX.value;
          if (overX > 0) {
            const dir = nx > 0 ? 1 : -1;
            const hasNext = dir < 0 ? homePage.value < assets.length - 1 : homePage.value > 0;
            const carry = overX * (hasNext ? EDGE_RESISTANCE : EDGE_RUBBER);
            offset.value = baseOffset.value + dir * carry;
          } else {
            offset.value = baseOffset.value;
          }
          current.tx.value = clamp(nx, -current.boundX.value, current.boundX.value);
          current.ty.value = clamp(ny, -current.boundY.value, current.boundY.value);
        }
      })
      .onEnd((event) => {
        const dx = event.translationX - startTx.value;
        const dy = event.translationY - startTy.value;

        if (mode.value === MODE_PAGE) {
          const projected = -(baseOffset.value + dx + event.velocityX * 0.2) / pageWidth;
          // Google-Photos style: one page per swipe, regardless of flick speed.
          // The mounted window (±1) always covers the target, so the flight
          // never crosses unmounted pages.
          const target = clamp(
            Math.min(Math.max(Math.round(projected), homePage.value - 1), homePage.value + 1),
            0,
            assets.length - 1
          );
          runOnJS(onIndexChange)(target);
          // Constant-duration glide: the flick's momentum seeds the start,
          // but the flight itself always takes ~400ms — never a speed snap.
          offset.value = withSpring(-target * pageWidth, {
            velocity: clamp(event.velocityX, -1200, 1200),
            ...Springs.slide,
          });
          settleDismiss();
        } else if (mode.value === MODE_DISMISS) {
          // iOS Photos dismisses in both vertical directions.
          const down = dy > 120 || event.velocityY > 900;
          const up = dy < -120 || event.velocityY < -900;
          if (down || up) {
            runOnJS(onDismiss)();
          } else {
            // Spring back to the resting state; neighbours reappear only
            // once the pager is back on its page.
            offset.value = withSpring(-homePage.value * pageWidth, Springs.snappy, (finished) => {
              if (finished) hideNeighbors.value = 0;
            });
            dismissTy.value = withSpring(0, Springs.gentle);
            dismissScale.value = withSpring(1, Springs.gentle);
            backdropOpacity.value = withTiming(1, { duration: 180 });
            rotation.value = withSpring(0, Springs.snappy);
          }
        } else if (mode.value === MODE_ZOOM) {
          const current = controllers.current.get(homePage.value);
          if (current) {
            const nx = baseZoomTx.value + dx;
            const overX = Math.max(0, Math.abs(nx) - current.boundX.value);
            const dir = nx > 0 ? 1 : nx < 0 ? -1 : 0;
            const hasNext = dir < 0 ? homePage.value < assets.length - 1 : homePage.value > 0;
            const sameWay = event.velocityX * dir > 0;
            const commit =
              overX > 0 &&
              hasNext &&
              (overX > pageWidth * EDGE_COMMIT_RATIO ||
                (overX > EDGE_COMMIT_MIN &&
                  sameWay &&
                  Math.abs(event.velocityX) > EDGE_COMMIT_VELOCITY));
            if (commit) {
              // Carry the drag into the neighbouring page and reset the zoom —
              // the incoming page lands fresh at 1×.
              const target = clamp(homePage.value + dir, 0, assets.length - 1);
              current.scale.value = 1;
              current.tx.value = 0;
              current.ty.value = 0;
              runOnJS(onIndexChange)(target);
              offset.value = withSpring(-target * pageWidth, Springs.slide);
            } else {
              // Settle the photo back inside its bounds, momentum seeded.
              const settledTx = clamp(
                nx + event.velocityX * 0.08,
                -current.boundX.value,
                current.boundX.value
              );
              const settledTy = clamp(
                baseZoomTy.value + dy + event.velocityY * 0.08,
                -current.boundY.value,
                current.boundY.value
              );
              current.tx.value = withSpring(settledTx, Springs.gentle);
              current.ty.value = withSpring(settledTy, Springs.gentle);
              offset.value = withSpring(-homePage.value * pageWidth, Springs.snappy);
            }
          }
        }
        ended.value = true;
        mode.value = MODE_NONE;
      })
      .onFinalize(() => {
        // Cancelled drag (e.g. a second finger landed): onEnd never ran, so
        // settle whichever mode was mid-gesture instead of leaving it stuck.
        if (!ended.value && mode.value === MODE_PAGE) {
          const target = clamp(Math.round(-offset.value / pageWidth), 0, assets.length - 1);
          runOnJS(onIndexChange)(target);
          offset.value = withSpring(-target * pageWidth, Springs.slide);
          settleDismiss();
        } else if (!ended.value && mode.value === MODE_DISMISS) {
          offset.value = withSpring(-homePage.value * pageWidth, Springs.snappy, (finished) => {
            if (finished) hideNeighbors.value = 0;
          });
          dismissTy.value = withSpring(0, Springs.gentle);
          dismissScale.value = withSpring(1, Springs.gentle);
          backdropOpacity.value = withTiming(1, { duration: 180 });
          rotation.value = withSpring(0, Springs.snappy);
        } else if (!ended.value && mode.value === MODE_ZOOM) {
          const zoomed = controllers.current.get(homePage.value);
          if (zoomed) {
            zoomed.tx.value = withSpring(
              clamp(zoomed.tx.value, -zoomed.boundX.value, zoomed.boundX.value),
              Springs.gentle
            );
            zoomed.ty.value = withSpring(
              clamp(zoomed.ty.value, -zoomed.boundY.value, zoomed.boundY.value),
              Springs.gentle
            );
          }
          offset.value = withSpring(-homePage.value * pageWidth, Springs.snappy);
        }
        ended.value = false;
        mode.value = MODE_NONE;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets.length,
    pageWidth,
    dismissTy,
    dismissScale,
    backdropOpacity,
    hideNeighbors,
    rotation,
    offset,
    onIndexChange,
    onDismiss,
  ]);

  // Only horizontal paging lives on the container — the dismiss transform
  // is per-page (see PagerPage).
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const window: number[] = [];
  for (let i = index - PAGE_WINDOW; i <= index + PAGE_WINDOW; i++) {
    if (i >= 0 && i < assets.length) window.push(i);
  }

  return (
    <GestureDetector gesture={pan}>
      <PagerContainer style={containerStyle}>
        {window.map((i) => (
          <PagerPage
            key={assets[i].id}
            asset={assets[i]}
            pageIndex={i}
            pageWidth={pageWidth}
            active={i === index}
            videoPlaying={videoPlaying}
            videoMuted={videoMuted}
            chromeVisible={chromeVisible}
            pagerPan={pan}
            hideNeighbors={hideNeighbors}
            dismissTy={dismissTy}
            dismissScale={dismissScale}
            rotation={rotation}
            dismiss={dismiss}
            onTap={onTap}
            onRegister={registerController}
          />
        ))}
      </PagerContainer>
    </GestureDetector>
  );
}
