import { PixelRatio } from 'react-native';

/**
 * Grid layout constants for photo grids. Phone defaults — actual column
 * count and cell size are derived from the live window width via
 * `columnsFor`/`cellSizeFor` (theme/scale.ts).
 */
export const GRID_COLUMNS = 3;
export const GRID_GAP = 2;

/** Motion durations in milliseconds. */
export const Durations = {
  fast: 160,
  normal: 240,
  slow: 400,
} as const;

/**
 * Spring configurations tuned for a Google Photos-like feel:
 * quick departure, gentle settle, never sluggish.
 */
export const Springs = {
  /** Chrome, checkmarks, chips — tight, no overshoot. */
  snappy: { damping: 28, stiffness: 300, mass: 0.9 },
  /** Hero expand/collapse, zoom release — soft settle. */
  gentle: { damping: 24, stiffness: 200, mass: 1 },
  /** Favorite heart, selection pop — playful overshoot. */
  bouncy: { damping: 14, stiffness: 240, mass: 0.8 },
  /** Photo pager page flight — constant-duration glide, fluid at any flick speed. */
  slide: { dampingRatio: 0.9, duration: 400 },
} as const;

/** Corner radii. */
export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/** Spacing scale on a 4pt grid — index by step, e.g. space[4] = 16. */
export const SPACE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72] as const;

/** Typography scale — sizes mirror the ThemedText variants. */
export const TYPE = {
  size: {
    display: 28,
    title: 20,
    titleMedium: 16,
    body: 15,
    bodySmall: 13,
    label: 12,
    caption: 11,
    micro: 10,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  letterSpacing: {
    tight: 0.4,
    slight: 0.2,
    normal: 0,
  },
  line: {
    body: 20,
    small: 18,
    title: 22,
  },
} as const;

/** Thinnest renderable line — replaces StyleSheet.hairlineWidth. */
export const HAIRLINE = 1 / PixelRatio.get();

/** Border widths. */
export const BORDER = {
  width: 1,
  thick: 1.5,
  wide: 2,
} as const;

/** Android elevation levels (iOS shadow params live in theme/shared.ts). */
export const ELEVATION = {
  low: 4,
  medium: 6,
} as const;
