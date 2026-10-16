/**
 * Vitest-only stub for the `react-native` module. Pure modules that pull
 * constants from `theme/tokens` transitively import `PixelRatio`; provide
 * the single API they touch (wired via `resolve.alias` in vitest.config.mts).
 */
export const PixelRatio = { get: () => 2 };
