import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeProvider as StyledThemeProvider, useTheme as useStyledTheme } from 'styled-components/native';

import { useSettingsStore } from '@/stores/settings';
import { darkColors, lightColors } from './colors';
import { BORDER, HAIRLINE, RADIUS, SPACE, TYPE } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.themeMode);
  const systemScheme = useColorScheme();
  const dark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const theme = useMemo(
    () => ({
      colors: dark ? darkColors : lightColors,
      dark,
      mode,
      space: SPACE,
      radius: RADIUS,
      type: TYPE,
      hairline: HAIRLINE,
      border: BORDER,
    }),
    [dark, mode]
  );

  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
}

/** Same public API as before: programmatic consumers (StatusBar, SystemUI, icon colors). */
export function useTheme() {
  return useStyledTheme();
}
