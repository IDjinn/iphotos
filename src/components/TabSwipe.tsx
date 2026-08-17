import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/animations/useReducedMotion';
import { beginTabEnter, takeTabEnter } from '@/navigation/tab-transition';
import { useSelectionStore } from '@/stores/selection';
import { SCREEN_WIDTH } from '@/theme/tokens';

/** Bottom-tab routes in bar order — a committed horizontal swipe moves between them. */
const TABS = ['/', '/search', '/library'] as const;
type TabPath = (typeof TABS)[number];

const EXIT_DISTANCE = SCREEN_WIDTH * 0.25;
const ENTER_DISTANCE = SCREEN_WIDTH * 0.3;
const EXIT_DURATION = 140;
const ENTER_DURATION = 220;

/**
 * Wraps a tab screen so swiping left/right navigates to the next/previous
 * tab (Photos ↔ Search ↔ Library) with a slide transition: this screen
 * nudges out in the swipe direction, then the target slides in from the
 * opposite side. Vertical scrolling is untouched (the pan only activates
 * on clearly horizontal drags) and swiping is disabled during selection.
 */
export function TabSwipe({ tab, children }: { tab: TabPath; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === tab;
  const reducedMotion = useReducedMotion();
  const selectionActive = useSelectionStore((s) => s.active);

  const x = useSharedValue(0);
  const opacity = useSharedValue(1);
  /** Counts swipe commits so a superseded hand-off never navigates. */
  const exitSeq = useSharedValue(0);

  // Runs in the same commit that makes this screen active, before paint —
  // the entrance offset is applied before the first visible frame.
  useLayoutEffect(() => {
    if (!isActive) return;
    const pending = takeTabEnter(tab);
    if (pending) {
      const easing = Easing.out(Easing.cubic);
      x.value = pending.dir * ENTER_DISTANCE;
      opacity.value = 0;
      x.value = withTiming(0, { duration: ENTER_DURATION, easing });
      opacity.value = withTiming(1, { duration: ENTER_DURATION, easing });
    } else {
      // Arrived via the tab bar or a stack pop — ensure fully visible.
      cancelAnimation(x);
      cancelAnimation(opacity);
      x.value = 0;
      opacity.value = 1;
    }
  }, [isActive, tab, x, opacity]);

  const pan = useMemo(() => {
    const commit = (target: TabPath, dir: 1 | -1) => {
      if (reducedMotion) {
        router.navigate(target);
        return;
      }
      const id = exitSeq.value + 1;
      exitSeq.value = id;
      // Phase 1: nudge this page out in the swipe direction.
      cancelAnimation(x);
      cancelAnimation(opacity);
      const easing = Easing.out(Easing.cubic);
      x.value = withTiming(dir * -EXIT_DISTANCE, { duration: EXIT_DURATION, easing });
      opacity.value = withTiming(0, { duration: EXIT_DURATION, easing });
      // Phase 2: hand off — the target slides in from the opposite side.
      setTimeout(() => {
        if (exitSeq.value !== id) return;
        beginTabEnter(target, dir);
        router.navigate(target);
      }, EXIT_DURATION);
    };
    return Gesture.Pan()
      .enabled(!selectionActive && isActive)
      .activeOffsetX([-20, 20])
      .failOffsetY([-14, 14])
      .onEnd((event, success) => {
        if (!success) return;
        const idx = TABS.indexOf(tab);
        const next = event.translationX < 0 ? idx + 1 : idx - 1;
        const committed = Math.abs(event.translationX) > 40 || Math.abs(event.velocityX) > 400;
        if (!committed || next < 0 || next >= TABS.length) return;
        const dir: 1 | -1 = event.translationX < 0 ? 1 : -1;
        runOnJS(commit)(TABS[next], dir);
      });
  }, [tab, router, isActive, selectionActive, reducedMotion, x, opacity, exitSeq]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
