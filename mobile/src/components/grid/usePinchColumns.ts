import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import {
  applyPinchStep,
  COLUMNS_MAX,
  COLUMNS_MIN,
} from '@/animations/gestures';
import { haptic } from '@/utils/haptics';

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
