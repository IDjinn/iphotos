import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';

interface MiniToastProps {
  message: string | null;
  topOffset?: number;
  onDismissed?: () => void;
  durationMs?: number;
}

/** Tiny transient confirmation pill. */
export function MiniToast({ message, topOffset, onDismissed, durationMs = 1600 }: MiniToastProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDismissed?.(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismissed]);

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(180)}
      style={[styles.wrap, { top: (topOffset ?? insets.top) + 12, backgroundColor: colors.surfaceElevated }]}
      pointerEvents="none"
    >
      <ThemedText variant="bodySmall" style={styles.text}>
        {message}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  text: { maxWidth: 280 },
});
