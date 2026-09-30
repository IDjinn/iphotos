import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';

import { useTheme } from '@/theme/context';

export type IconName = keyof typeof Ionicons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Themed Ionicons wrapper. */
export function Icon({ name, size = 24, color }: IconProps) {
  const { colors } = useTheme();
  const resolved = color ?? colors.icon;
  return useMemo(() => <Ionicons name={name} size={size} color={resolved} />, [name, size, resolved]);
}
