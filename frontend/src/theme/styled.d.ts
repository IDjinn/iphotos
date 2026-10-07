import 'styled-components';

import type { ThemeColors } from './colors';
import type { ThemeMode } from './context';
import type { BORDER, RADIUS, SPACE, TYPE } from './tokens';

interface AppTheme {
  dark: boolean;
  mode: ThemeMode;
  colors: ThemeColors;
  space: readonly number[];
  radius: typeof RADIUS;
  type: typeof TYPE;
  hairline: number;
  border: typeof BORDER;
}

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}

// `styled-components/native` re-declares DefaultTheme in the package internals
// (it does not re-export the root one) — augment that declaration as well.
declare module 'styled-components/native/dist/models/ThemeProvider' {
  export interface DefaultTheme extends AppTheme {}
}
