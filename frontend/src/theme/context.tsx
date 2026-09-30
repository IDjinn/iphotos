import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettingsStore } from '@/stores/settings';
import { darkColors, lightColors, type ThemeColors } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: ThemeColors;
  dark: boolean;
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  dark: false,
  mode: 'system',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.themeMode);
  const systemScheme = useColorScheme();
  const dark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: dark ? darkColors : lightColors, dark, mode }),
    [dark, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
