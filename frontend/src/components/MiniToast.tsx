import { useEffect } from 'react';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, Wrap } from '@/components/MiniToast.styles';
import { useTheme } from '@/theme/context';

interface MiniToastProps {
  message: string | null;
  topOffset?: number;
  onDismissed?: () => void;
  durationMs?: number;
}

/** Tiny transient confirmation pill. */
export function MiniToast({ message, topOffset, onDismissed, durationMs = 1600 }: MiniToastProps) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDismissed?.(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismissed]);

  if (!message) return null;

  return (
    <Wrap
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(180)}
      $top={(topOffset ?? insets.top) + space[3]}
      pointerEvents="none"
    >
      <Text variant="bodySmall">
        {message}
      </Text>
    </Wrap>
  );
}
