import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { AccessibilityActionEvent } from 'react-native';

import { useReducedMotion } from '@/animations/useReducedMotion';
import { ThemedText } from '@/components/ThemedText';
import {
  buildRailKnots,
  buildRailTicks,
  markerBubbleLabel,
  offsetToRail,
  railToOffset,
  type GridLayoutMetrics,
} from '@/data/grid-metrics';
import { Durations } from '@/theme/tokens';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

import { Bubble, Handle, Rail, Tick, TickLayer, Zone } from './FastScroll.styles';

export interface FastScrollHandle {
  /** Show the rail and restart the auto-hide timer (grid calls this on scroll). */
  reveal: () => void;
}

interface FastScrollProps {
  /** Month markers + content height on the full timeline scale. */
  metrics: GridLayoutMetrics;
  viewportHeight: number;
  /** Live list scroll offset — kept current by the grid's onScroll. */
  scrollOffset: SharedValue<number>;
  scrollToOffset: (offset: number, animated: boolean) => void;
  /**
   * Timeline Y where the loaded window begins (cloud galleries rebase the
   * list on a month jump). 0 = the list is the whole timeline.
   */
  windowOffset?: number;
  /** Loaded content height on the timeline scale (defaults to contentHeight). */
  windowHeight?: number;
  /**
   * Release/a11y landed on a month above the loaded window — the owner
   * refetches starting there. Without it, out-of-window months snap to top.
   */
  onJumpToMonth?: (markerIndex: number) => void;
  /**
   * Scrub reached the end of the loaded timeline — the owner should page in
   * more (called on every update while held there, and on release).
   */
  onNeedMore?: () => void;
}

const HIDE_DELAY_MS = 700;
/** Rail never fully hides, so it is always easy to grab. */
const RAIL_IDLE_OPACITY = 1;
const MIN_THUMB_DP = 48;
const BUBBLE_HALF_DP = 18;
const NEED_MORE_PROGRESS = 0.9;
const TICK_MIN_GAP_DP = 16;
const TICK_HALF_DP = 7;

/**
 * Google-Photos-style fast scroll: a right-edge rail with a draggable
 * thumb, a month bubble while scrubbing, and a snap to the month under
 * the thumb on release. An overlay only — touches pass through everywhere
 * except the rail zone itself.
 */
export const FastScroll = forwardRef<FastScrollHandle, FastScrollProps>(function FastScroll(
  {
    metrics,
    viewportHeight,
    scrollOffset,
    scrollToOffset,
    windowOffset = 0,
    windowHeight,
    onJumpToMonth,
    onNeedMore,
  },
  ref
) {
  const { ms, space } = useTheme();
  const reducedMotion = useReducedMotion();

  const opacity = useSharedValue(1);
  // Labels only show while scrolling/scrubbing; the rail itself stays put.
  const tickOpacity = useSharedValue(0);
  const dragging = useSharedValue(0);
  const dragProgress = useSharedValue(0);
  const lastMonth = useSharedValue(-1);

  const [active, setActive] = useState(false);
  const [monthLabel, setMonthLabel] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const inset = space[3];
  const timelineHeight = metrics.contentHeight;
  const windowH = windowHeight ?? timelineHeight;
  const maxScroll = Math.max(0, windowH - viewportHeight);
  const timelineScrollable = Math.max(1, timelineHeight - viewportHeight);
  const knots = useMemo(
    () => buildRailKnots(metrics.months, timelineScrollable),
    [metrics, timelineScrollable]
  );
  const trackHeight = Math.max(0, viewportHeight - inset * 2);
  const thumbHeight = Math.max(
    ms(MIN_THUMB_DP),
    Math.round((viewportHeight / Math.max(timelineHeight, 1)) * trackHeight)
  );
  const travel = Math.max(0, trackHeight - thumbHeight);
  // Hoisted for bubbleStyle — theme closures can't be called inside worklets.
  const bubbleHalf = ms(BUBBLE_HALF_DP);

  const reveal = useCallback(() => {
    opacity.value = withTiming(1, { duration: reducedMotion ? 0 : Durations.fast });
    tickOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : Durations.fast });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!draggingRef.current) {
        opacity.value = withTiming(RAIL_IDLE_OPACITY, { duration: reducedMotion ? 0 : Durations.normal });
        tickOpacity.value = withTiming(0, { duration: reducedMotion ? 0 : Durations.normal });
      }
    }, HIDE_DELAY_MS);
  }, [opacity, tickOpacity, reducedMotion]);

  useImperativeHandle(ref, () => ({ reveal }), [reveal]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const scrubTo = useCallback(
    (offset: number) => scrollToOffset(Math.min(offset, maxScroll), false),
    [scrollToOffset, maxScroll]
  );

  const showMonth = useCallback(
    (index: number) => {
      const marker = metrics.months[index];
      if (!marker) return;
      setMonthLabel(markerBubbleLabel(marker, currentYear));
      haptic('selection');
    },
    [metrics, currentYear]
  );

  // Rail labels: months of this year + one tick per older year, thinned so
  // neighbours never overlap.
  const ticks = useMemo(() => {
    const minGap = ms(TICK_MIN_GAP_DP);
    const placed: { top: number; label: string }[] = [];
    let lastTop = -Infinity;
    for (const tick of buildRailTicks(metrics.months, currentYear)) {
      const progress = offsetToRail(tick.offset, knots);
      const top = inset + progress * travel + thumbHeight / 2 - ms(TICK_HALF_DP);
      if (top - lastTop < minGap) continue;
      placed.push({ top, label: tick.label });
      lastTop = top;
    }
    return placed;
  }, [metrics, currentYear, knots, inset, travel, thumbHeight, ms]);

  const settle = useCallback(
    (index: number) => {
      draggingRef.current = false;
      setActive(false);
      const marker = metrics.months[index];
      if (!marker) {
        reveal();
        return;
      }
      const beyondLoaded = marker.offset >= windowOffset + windowH;
      if (onJumpToMonth && (marker.offset < windowOffset || beyondLoaded)) {
        onJumpToMonth(index);
      } else if (marker.offset >= windowOffset) {
        scrollToOffset(marker.offset - windowOffset, !reducedMotion);
      } else {
        scrollToOffset(0, !reducedMotion);
      }
      reveal();
    },
    [metrics, scrollToOffset, reducedMotion, reveal, windowOffset, windowH, onJumpToMonth]
  );

  const beginScrub = useCallback(() => {
    draggingRef.current = true;
    lastMonth.value = -1;
    setActive(true);
    reveal();
  }, [lastMonth, reveal]);

  const endIdleTouch = useCallback(() => {
    // Pan never activated (plain tap) — release the dragging guard so the
    // auto-hide timer can fire again.
    if (dragging.value === 0 && draggingRef.current) {
      draggingRef.current = false;
      setActive(false);
      reveal();
    }
  }, [dragging, reveal]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(ms(6))
        .onTouchesDown(() => runOnJS(beginScrub)())
        .onTouchesUp(() => runOnJS(endIdleTouch)())
        .onUpdate((e) => {
          dragging.value = 1;
          const progress = Math.min(1, Math.max(0, (e.y - inset - thumbHeight / 2) / travel));
          dragProgress.value = progress;
          if (onNeedMore && progress >= NEED_MORE_PROGRESS) runOnJS(onNeedMore)();
          // Scrub position on the full timeline: inside the loaded window it
          // scrolls live, above it the bubble previews the month a release
          // will jump to.
          const target = railToOffset(progress, knots);
          if (target >= windowOffset) {
            runOnJS(scrubTo)(target - windowOffset);
          }
          // Inline month scan — regular functions can't be called in worklets.
          const months = metrics.months;
          let index = 0;
          for (let i = 0; i < months.length; i += 1) {
            if (months[i].offset <= target) index = i;
            else break;
          }
          if (index !== lastMonth.value) {
            lastMonth.value = index;
            runOnJS(showMonth)(index);
          }
        })
        .onEnd(() => {
          dragging.value = 0;
          runOnJS(settle)(lastMonth.value);
          if (onNeedMore && dragProgress.value >= NEED_MORE_PROGRESS) runOnJS(onNeedMore)();
        }),
    [
      ms,
      inset,
      thumbHeight,
      travel,
      knots,
      windowOffset,
      metrics,
      dragging,
      dragProgress,
      lastMonth,
      beginScrub,
      endIdleTouch,
      showMonth,
      scrubTo,
      settle,
      onNeedMore,
    ]
  );

  const railStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const tickLayerStyle = useAnimatedStyle(() => ({ opacity: tickOpacity.value }));

  const thumbStyle = useAnimatedStyle(() => {
    const progress = dragging.value
      ? dragProgress.value
      : offsetToRail(windowOffset + Math.min(Math.max(scrollOffset.value, 0), maxScroll), knots);
    return { transform: [{ translateY: progress * travel }] };
  });

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(dragging.value, { duration: reducedMotion ? 0 : Durations.fast }),
    transform: [
      {
        translateY: inset + dragProgress.value * travel + thumbHeight / 2 - bubbleHalf,
      },
      {
        scale: withTiming(dragging.value ? 1 : 0.95, {
          duration: reducedMotion ? 0 : Durations.fast,
        }),
      },
    ],
  }));

  const jumpMonth = useCallback(
    (delta: number) => {
      const months = metrics.months;
      if (months.length === 0) return;
      const current = windowOffset + Math.min(Math.max(scrollOffset.value, 0), maxScroll);
      let index = 0;
      for (let i = 0; i < months.length; i += 1) {
        if (months[i].offset <= current) index = i;
        else break;
      }
      const next = Math.min(months.length - 1, Math.max(0, index + delta));
      const marker = months[next];
      haptic('selection');
      if (onJumpToMonth && (marker.offset < windowOffset || marker.offset >= windowOffset + windowH)) {
        onJumpToMonth(next);
      } else if (marker.offset >= windowOffset) {
        scrollToOffset(marker.offset - windowOffset, !reducedMotion);
      }
      reveal();
    },
    [metrics, scrollOffset, maxScroll, windowOffset, windowH, scrollToOffset, reducedMotion, onJumpToMonth, reveal]
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      jumpMonth(event.nativeEvent.actionName === 'increment' ? 1 : -1);
    },
    [jumpMonth]
  );

  if (metrics.months.length === 0 || maxScroll <= 0) return null;

  return (
    <Rail pointerEvents="box-none" style={railStyle}>
      <GestureDetector gesture={gesture}>
        <Zone
          accessibilityRole="adjustable"
          accessibilityLabel="Fast scroll by month"
          accessibilityActions={[
            { name: 'increment', label: 'Next month' },
            { name: 'decrement', label: 'Previous month' },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <Handle style={thumbStyle} $height={thumbHeight} $active={active} />
        </Zone>
      </GestureDetector>
      <TickLayer style={tickLayerStyle} pointerEvents="none">
        {ticks.map((tick) => (
          <Tick key={`${tick.label}-${tick.top}`} $top={tick.top}>
            {tick.label}
          </Tick>
        ))}
      </TickLayer>
      <Bubble style={bubbleStyle} pointerEvents="none">
        <ThemedText variant="body" color="textInverse">
          {monthLabel}
        </ThemedText>
      </Bubble>
    </Rail>
  );
});
