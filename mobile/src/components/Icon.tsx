import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';

import { useTheme } from '@/theme/context';

export type IconName = keyof typeof Ionicons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/**
 * Themed Ionicons wrapper. Glyph sizes are reference dp values — they scale
 * with the window width like every other dimension (doc 17, D18).
 */
export function Icon({ name, size = 24, color }: IconProps) {
  const { colors, ms } = useTheme();
  const resolved = color ?? colors.icon;
  return useMemo(() => <Ionicons name={name} size={ms(size)} color={resolved} />, [name, size, ms, resolved]);
}
