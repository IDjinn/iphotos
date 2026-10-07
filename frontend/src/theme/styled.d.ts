import 'styled-components';

import type { ThemeColors } from './colors';
import type { ThemeMode } from './context';
import type { TYPE } from './tokens';

/**
 * Spacing/radius/type scales arrive scaled by the live window width
 * (doc 17, D18), so the theme carries plain numbers rather than the literal
 * token values from tokens.ts — those are the unscaled reference tables.
 */
interface AppTheme {
  dark: boolean;
  mode: ThemeMode;
  colors: ThemeColors;
  /** Live scale factor (window width vs BASE_WIDTH, clamped). */
  scale: number;
  /** Scale a reference dp size for the current window — fixed control sizes. */
  ms(size: number): number;
  space: readonly number[];
  radius: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  type: {
    size: {
      display: number;
      title: number;
      titleMedium: number;
      body: number;
      bodySmall: number;
      label: number;
      caption: number;
      micro: number;
    };
    weight: typeof TYPE.weight;
    letterSpacing: typeof TYPE.letterSpacing;
    line: { body: number; small: number };
  };
  hairline: number;
  border: { width: number; thick: number; wide: number };
}

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}

// `styled-components/native` re-declares DefaultTheme in the package internals
// (it does not re-export the root one) — augment that declaration as well.
declare module 'styled-components/native/dist/models/ThemeProvider' {
  export interface DefaultTheme extends AppTheme {}
}
