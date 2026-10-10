import { describe, expect, it } from 'vitest';

import {
  applyPinchStep,
  COLUMNS_MAX,
  COLUMNS_MIN,
  shouldCommitPinchDismiss,
} from './gestures';

describe('shouldCommitPinchDismiss', () => {
  it('commits when the photo shrank past the scale threshold', () => {
    expect(shouldCommitPinchDismiss(0.9, 0)).toBe(true);
    expect(shouldCommitPinchDismiss(0.92, 0)).toBe(true);
  });

  it('commits on a fast shrinking release even above the scale threshold', () => {
    expect(shouldCommitPinchDismiss(0.97, -1.4)).toBe(true);
    expect(shouldCommitPinchDismiss(0.97, -1)).toBe(true);
  });

  it('restores for a shallow, slow release', () => {
    expect(shouldCommitPinchDismiss(0.97, 0)).toBe(false);
    expect(shouldCommitPinchDismiss(0.97, -0.5)).toBe(false);
    expect(shouldCommitPinchDismiss(1, 2)).toBe(false);
  });
});

describe('applyPinchStep', () => {
  it('steps down (fewer columns) as fingers spread past the step factor', () => {
    expect(applyPinchStep(1.3, 5)).toEqual({ columns: 4, accum: 1, changed: true });
  });

  it('steps up (more columns) as fingers pinch in below the inverse factor', () => {
    expect(applyPinchStep(1 / 1.3, 5)).toEqual({ columns: 6, accum: 1, changed: true });
    expect(applyPinchStep(0.6, 5)).toEqual({ columns: 6, accum: 0.78, changed: true });
  });

  it('carries the remainder so a continuous pinch keeps stepping', () => {
    // Products of the step factor avoid float drift (1.3² as a literal is
    // 1.69, which sits just under a full second step).
    const two = applyPinchStep(1.3 * 1.3, 5);
    expect(two.columns).toBe(3);
    expect(two.changed).toBe(true);
    expect(two.accum).toBeCloseTo(1, 6);
    const three = applyPinchStep(1.3 * 1.3 * 1.3, 5);
    expect(three.columns).toBe(2);
    expect(three.changed).toBe(true);
    expect(three.accum).toBeCloseTo(1, 6);
  });

  it('clamps at the column bounds and bounds the accumulator there', () => {
    const atMin = applyPinchStep(4, COLUMNS_MIN);
    expect(atMin.columns).toBe(COLUMNS_MIN);
    expect(atMin.accum).toBe(1.3);
    expect(atMin.changed).toBe(false);

    const atMax = applyPinchStep(0.2, COLUMNS_MAX);
    expect(atMax.columns).toBe(COLUMNS_MAX);
    expect(atMax.accum).toBeCloseTo(1 / 1.3);
    expect(atMax.changed).toBe(false);
  });

  it('keeps the state untouched for sub-threshold ratios', () => {
    expect(applyPinchStep(1.1, 4)).toEqual({ columns: 4, accum: 1.1, changed: false });
    expect(applyPinchStep(0.9, 4)).toEqual({ columns: 4, accum: 0.9, changed: false });
  });
});
