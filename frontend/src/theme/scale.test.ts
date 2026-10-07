import { describe, expect, it } from 'vitest';

import { BASE_WIDTH, cellSizeFor, columnsFor, ms, scaleFactor } from './scale';

describe('scaleFactor', () => {
  it('is 1 at the base width', () => {
    expect(scaleFactor(BASE_WIDTH)).toBe(1);
  });

  it('grows with the window width', () => {
    expect(scaleFactor(430)).toBeCloseTo(430 / 390);
  });

  it('clamps small phones at 0.85', () => {
    expect(scaleFactor(320)).toBe(0.85);
    expect(scaleFactor(100)).toBe(0.85);
  });

  it('clamps tablets at 1.25', () => {
    expect(scaleFactor(768)).toBe(1.25);
    expect(scaleFactor(1024)).toBe(1.25);
  });
});

describe('ms', () => {
  it('keeps sizes at the base width', () => {
    expect(ms(390, 52)).toBe(52);
    expect(ms(390, 15)).toBe(15);
  });

  it('scales and rounds to whole dp', () => {
    // 430/390 ≈ 1.1026
    expect(ms(430, 52)).toBe(Math.round(52 * (430 / 390)));
    expect(Number.isInteger(ms(430, 52))).toBe(true);
  });

  it('never shrinks below the 0.85 clamp', () => {
    expect(ms(320, 72)).toBe(Math.round(72 * 0.85));
  });

  it('never grows above the 1.25 clamp', () => {
    expect(ms(1024, 72)).toBe(Math.round(72 * 1.25));
  });

  it('keeps zero at zero', () => {
    expect(ms(430, 0)).toBe(0);
  });
});

describe('columnsFor', () => {
  it('keeps 3 columns on phones', () => {
    expect(columnsFor(320)).toBe(3);
    expect(columnsFor(390)).toBe(3);
    expect(columnsFor(599)).toBe(3);
  });

  it('widens to 5 columns on tablets', () => {
    expect(columnsFor(600)).toBe(5);
    expect(columnsFor(768)).toBe(5);
    expect(columnsFor(899)).toBe(5);
  });

  it('widens to 7 columns on large tablets', () => {
    expect(columnsFor(900)).toBe(7);
    expect(columnsFor(1024)).toBe(7);
  });
});

describe('cellSizeFor', () => {
  it('splits the width across columns minus gaps', () => {
    // (390 - 2*2) / 3 = 128.67 → floored
    expect(cellSizeFor(390, 3, 2)).toBe(128);
    // (1024 - 6*2) / 7 = 144.57 → floored
    expect(cellSizeFor(1024, 7, 2)).toBe(144);
  });

  it('fills the full width when cells are laid out', () => {
    const width = 768;
    const gap = 2;
    const cols = columnsFor(width);
    const cell = cellSizeFor(width, cols, gap);
    expect(cell * cols + gap * (cols - 1)).toBeLessThanOrEqual(width);
  });
});
