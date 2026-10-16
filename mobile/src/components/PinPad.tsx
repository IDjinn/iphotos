import { useEffect, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import {
  DigitKey,
  Dot,
  DotsWrap,
  Grid,
  Key,
  KeySpacer,
  PadWrap,
} from '@/components/PinPad.styles';
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

/** Single keypad digit with pressed feedback (parity with the original opacity dip). */
function Digit({ digit, onPress }: { digit: string; onPress: (digit: string) => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <DigitKey
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onPress(digit)}
    >
      <ThemedText variant="title">{digit}</ThemedText>
    </DigitKey>
  );
}

/** Numeric keypad with per-key press feedback and a wrong-PIN shake. */
export function PinPad({ length, maxLength, shakeKey, onDigit, onBackspace }: PinPadProps) {
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
    <PadWrap style={shakeStyle}>
      <Grid>
        {keys.map((key, i) => {
          if (key === '') return <KeySpacer key={i} />;
          if (key === 'back') {
            return (
              <Key key={i} onPress={onBackspace} accessibilityLabel="Delete digit">
                <ThemedText variant="titleMedium" color="secondary">
                  ⌫
                </ThemedText>
              </Key>
            );
          }
          return (
            <Digit
              key={i}
              digit={key}
              onPress={(digit) => {
                if (length >= maxLength) return;
                haptic('selection');
                onDigit(digit);
              }}
            />
          );
        })}
      </Grid>
    </PadWrap>
  );
}

/** PIN progress dots. */
export function PinDots({ length, maxLength, error }: { length: number; maxLength: number; error?: boolean }) {
  return (
    <DotsWrap>
      {Array.from({ length: maxLength }).map((_, i) => (
        <Dot key={i} $state={i < length ? (error ? 'error' : 'filled') : 'empty'} />
      ))}
    </DotsWrap>
  );
}
