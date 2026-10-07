import { useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { ThemeProvider as StyledThemeProvider, useTheme as useStyledTheme } from 'styled-components/native';

import { useSettingsStore } from '@/stores/settings';
import { darkColors, lightColors } from './colors';
import { ms, scaleFactor } from './scale';
import { BORDER, HAIRLINE, RADIUS, SPACE, TYPE } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Builds the styled-components theme. Spacing, type and radius scales are
 * scaled proportionally from the live window width (doc 17, D18): a window
 * change (foldable posture, split view) rebuilds the theme and every
 * styled-components consumer re-renders with the new metrics.
 */
function buildTheme(dark: boolean, mode: ThemeMode, width: number) {
  return {
    colors: dark ? darkColors : lightColors,
    dark,
    mode,
    scale: scaleFactor(width),
    ms: (size: number) => ms(width, size),
    space: SPACE.map((step) => ms(width, step)),
    radius: {
      xs: ms(width, RADIUS.xs),
      sm: ms(width, RADIUS.sm),
      md: ms(width, RADIUS.md),
      lg: ms(width, RADIUS.lg),
      xl: ms(width, RADIUS.xl),
      // Pill sentinel, not a size — keep so borders never round past the box.
      full: RADIUS.full,
    },
    type: {
      size: {
        display: ms(width, TYPE.size.display),
        title: ms(width, TYPE.size.title),
        titleMedium: ms(width, TYPE.size.titleMedium),
        body: ms(width, TYPE.size.body),
        bodySmall: ms(width, TYPE.size.bodySmall),
        label: ms(width, TYPE.size.label),
        caption: ms(width, TYPE.size.caption),
        micro: ms(width, TYPE.size.micro),
      },
      weight: TYPE.weight,
      letterSpacing: TYPE.letterSpacing,
      line: {
        body: ms(width, TYPE.line.body),
        small: ms(width, TYPE.line.small),
      },
    },
    // Hairline is physical (1/PixelRatio) and borders stay crisp — unscaled.
    hairline: HAIRLINE,
    border: BORDER,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.themeMode);
  const systemScheme = useColorScheme();
  const dark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const { width } = useWindowDimensions();

  const theme = useMemo(() => buildTheme(dark, mode, width), [dark, mode, width]);

  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
}

/** Same public API as before: programmatic consumers (StatusBar, SystemUI, icon colors). */
export function useTheme() {
  return useStyledTheme();
}
