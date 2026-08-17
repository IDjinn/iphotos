import { Dimensions } from 'react-native';

/** Grid layout constants for photo grids. */
export const GRID_COLUMNS = 3;
export const GRID_GAP = 2;
export const SCREEN_WIDTH = Dimensions.get('window').width;
export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const GRID_CELL_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
);

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
} as const;

/** Corner radii. */
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;
