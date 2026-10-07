import type { TextProps } from 'react-native';

import { ThemedTextBase, type Tone, type Variant } from '@/components/ThemedText.styles';

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: Tone;
}

/** Themed text — variant-driven typography, token-driven color. */
export function ThemedText({ variant = 'body', color = 'primary', style, ...rest }: ThemedTextProps) {
  return <ThemedTextBase $variant={variant} $tone={color} style={style} {...rest} />;
}
