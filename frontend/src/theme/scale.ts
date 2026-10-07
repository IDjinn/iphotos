/**
 * Proportional scaling model (doc 17, D18).
 *
 * Every dimension in the app is authored against a reference screen width and
 * scaled proportionally at the token layer: `theme.space`, `theme.type`,
 * `theme.radius` and `theme.ms(size)` all derive from the live window width,
 * so the UI keeps its proportions across devices. Clamps keep extremes sane —
 * small phones never shrink controls below usable touch targets, and tablets
 * cap the factor (the photo grid adds columns on wide screens instead).
 *
 * Pure module: no React Native imports — safe for unit tests.
 */

/** Reference width (dp) the scales were designed on — iPhone mid-size. */
export const BASE_WIDTH = 390;

/** Floor for the scale factor: 330dp devices stay usable. */
export const MIN_SCALE = 0.85;

/** Ceiling for the scale factor: tablets grow at most 25%, then gain columns. */
export const MAX_SCALE = 1.25;

/** Scale factor for a window width, clamped to sane bounds. */
export function scaleFactor(width: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / BASE_WIDTH));
}

/** Scale a reference dp size for the given window width, rounded to whole dp. */
export function ms(width: number, size: number): number {
  return Math.round(size * scaleFactor(width));
}

/**
 * Photo grid columns by window width (dp): phones keep the 3-column layout,
 * tablets get 5, large tablets / unfolded foldables 7.
 */
export function columnsFor(width: number): number {
  if (width >= 900) return 7;
  if (width >= 600) return 5;
  return 3;
}

/** Cell size for a `columns` grid with `gap` dp gaps across `width`. */
export function cellSizeFor(width: number, columns: number, gap: number): number {
  return Math.floor((width - gap * (columns - 1)) / columns);
}

/**
 * Content cap (dp, unscaled) for list-style screens: on wide screens the
 * scroll content centers instead of stretching rows edge to edge.
 */
export const CONTENT_MAX_WIDTH = 640;
