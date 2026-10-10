/**
 * Pure gesture math shared by the viewer and the photo grid (doc 19).
 * No React Native imports — safe for unit tests and callable from
 * Reanimated worklets ('worklet' directives below).
 */

/** Pinch shrink past 1× that commits the dismiss (iOS Photos turns the pinch into the close). */
export const DISMISS_COMMIT_SCALE = 0.92;
/** Pinch velocity (scale/s) considered a deliberate shrink. */
export const DISMISS_COMMIT_VELOCITY = -1;
/** Visual floor for the pinch-shrunk photo. */
export const PINCH_FLOOR = 0.45;

/** Accumulated pinch ratio per column step — the iOS-Photos-like snap. */
export const PINCH_STEP = 1.3;
/** Column bounds for the grid pinch gesture. */
export const COLUMNS_MIN = 2;
export const COLUMNS_MAX = 7;

/**
 * Pure dismiss-pinch commit decision: the pinch releases into the close
 * flight when the photo shrank far enough or the fingers were still moving
 * apart-together fast enough.
 */
export function shouldCommitPinchDismiss(scale: number, velocity: number): boolean {
  return scale <= DISMISS_COMMIT_SCALE || velocity <= DISMISS_COMMIT_VELOCITY;
}

/**
 * Fold an accumulated pinch ratio into a column count: spreading fingers
 * (ratio > 1) means bigger cells → fewer columns, pinching in adds columns.
 * The remainder carries over, so a continuous pinch keeps stepping.
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
