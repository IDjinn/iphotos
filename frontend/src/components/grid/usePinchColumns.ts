import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { haptic } from '@/utils/haptics';

/** Accumulated pinch ratio per column step — the iOS-Photos-like snap. */
export const PINCH_STEP = 1.3;
/** Column bounds for the pinch gesture. */
export const COLUMNS_MIN = 2;
export const COLUMNS_MAX = 7;

/**
 * Fold an accumulated pinch ratio into a column count: spreading fingers
 * (ratio > 1) means bigger cells → fewer columns, pinching in adds columns.
 * The remainder carries over, so a continuous pinch keeps stepping. Pure —
 * unit-tested and callable from worklets.
 */
export function applyPinchStep(
  accum: number,
  columns: number,
  min: number = COLUMNS_MIN,
  max: number = COLUMNS_MAX,
  step: number = PINCH_STEP
): { columns: number; accum: number; changed: boolean } {
  'worklet';
  let next = columns;
  let rest = accum;
  let changed = false;
  while (rest >= step && next > min) {
    rest /= step;
    next -= 1;
    changed = true;
  }
  while (rest <= 1 / step && next < max) {
    rest *= step;
    next += 1;
    changed = true;
  }
  // Bound the accumulator at the gesture edges so a held overshoot on an
  // already-min/max grid can't bank up and fire a burst of steps later.
  if (rest > step) rest = step;
  if (rest < 1 / step) rest = 1 / step;
  return { columns: next, accum: rest, changed };
}

interface UsePinchColumnsOptions {
  min?: number;
  max?: number;
  /** Called (JS thread) right before the column count changes — capture scroll anchors here. */
  onStep?: (nextColumns: number) => void;
}

/**
 * iOS-Photos-style grid pinch: a two-finger pinch steps the column count
 * (discrete snap + selection haptic) instead of rescaling cells fluidly.
 * Session-scoped, seeded from the adaptive `base` (doc 17) — iOS does not
 * persist the user's pinch either.
 */
export function usePinchColumns(base: number, options: UsePinchColumnsOptions = {}) {
  const { min = COLUMNS_MIN, max = COLUMNS_MAX, onStep } = options;
  const clampColumn = useCallback(
    (n: number) => Math.min(max, Math.max(min, Math.round(n))),
    [min, max]
  );
  const [columns, setColumns] = useState(() => clampColumn(base));
  const columnsValue = useSharedValue(columns);
  const accum = useSharedValue(1);

  // Follow the adaptive base when the window resizes (foldable/tablet).
  useEffect(() => {
    const next = clampColumn(base);
    setColumns(next);
    columnsValue.value = next;
  }, [base, clampColumn]);

  const applyColumns = useCallback(
    (next: number) => {
      onStep?.(next);
      setColumns(next);
      haptic('selection');
    },
    [onStep]
  );

  const gesture = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          accum.value *= event.scale;
          const result = applyPinchStep(accum.value, columnsValue.value, min, max);
          accum.value = result.accum;
          if (result.changed) {
            columnsValue.value = result.columns;
            runOnJS(applyColumns)(result.columns);
          }
        })
        .onEnd(() => {
          accum.value = 1;
        }),
    [accum, columnsValue, min, max, applyColumns]
  );

  return { columns, gesture } as const;
}
