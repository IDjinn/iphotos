import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/context';

type Variant = 'display' | 'title' | 'titleMedium' | 'body' | 'bodySmall' | 'label';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: 28, fontWeight: '400' },
  title: { fontSize: 20, fontWeight: '500' },
  titleMedium: { fontSize: 16, fontWeight: '500' },
  body: { fontSize: 15, fontWeight: '400' },
  bodySmall: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase' },
};

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: 'primary' | 'secondary' | 'accent' | 'danger' | 'inverse';
}

export function ThemedText({ variant = 'body', color = 'primary', style, ...rest }: ThemedTextProps) {
  const { colors } = useTheme();
  const colorValue =
    color === 'secondary'
      ? colors.textSecondary
      : color === 'accent'
        ? colors.accent
        : color === 'danger'
          ? colors.danger
          : color === 'inverse'
            ? colors.background
            : colors.text;

  return <Text style={[styles.base, VARIANTS[variant], { color: colorValue }, style]} {...rest} />;
}

const styles = StyleSheet.create({ base: {} });
