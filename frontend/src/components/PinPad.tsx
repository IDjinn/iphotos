import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface PinPadProps {
  /** Current entered PIN length (dots render externally). */
  length: number;
  maxLength: number;
  /** Bump to trigger a shake (wrong PIN). */
  shakeKey: number;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}

/** Numeric keypad with per-key press feedback and a wrong-PIN shake. */
export function PinPad({ length, maxLength, shakeKey, onDigit, onBackspace }: PinPadProps) {
  const { colors } = useTheme();
  const shake = useSharedValue(0);

  useEffect(() => {
    if (shakeKey === 0) return;
    haptic('error');
    shake.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(12, { duration: 90 }),
      withTiming(-8, { duration: 70 }),
      withTiming(0, { duration: 60 })
    );
  }, [shakeKey, shake]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <Animated.View style={[styles.wrap, shakeStyle]}>
      <View style={styles.grid}>
        {keys.map((key, i) => {
          if (key === '') return <View key={i} style={styles.key} />;
          if (key === 'back') {
            return (
              <Pressable key={i} style={styles.key} onPress={onBackspace} accessibilityLabel="Delete digit">
                <ThemedText variant="titleMedium" color="secondary">
                  ⌫
                </ThemedText>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.key,
                styles.digit,
                { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={() => {
                if (length >= maxLength) return;
                haptic('selection');
                onDigit(key);
              }}
            >
              <ThemedText variant="title">{key}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

/** PIN progress dots. */
export function PinDots({ length, maxLength, error }: { length: number; maxLength: number; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={dotStyles.wrap}>
      {Array.from({ length: maxLength }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            {
              backgroundColor:
                i < length ? (error ? colors.danger : colors.accent) : colors.outline,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, gap: 18, justifyContent: 'center' },
  key: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  digit: { borderRadius: 36 },
});

const dotStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 14, height: 16, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
