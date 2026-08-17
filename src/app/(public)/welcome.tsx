import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { useOnboardingStore } from '@/stores/onboarding';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const BULLETS = [
  'Works fully offline',
  'Optional end-to-end encrypted backup',
  'Smart search that runs on your device',
];

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  const continueOffline = () => {
    haptic('light');
    complete('offline');
    router.replace('/');
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <Animated.View entering={FadeInDown.duration(300)} style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: colors.accentSoft }]}>
          <Icon name="images" size={44} color={colors.accent} />
        </View>
        <ThemedText variant="display" style={styles.title}>
          iPhotos
        </ThemedText>
        <ThemedText variant="body" color="secondary" style={styles.tagline}>
          Your photos. Private by default.
        </ThemedText>
      </Animated.View>

      <View style={styles.bullets}>
        {BULLETS.map((bullet, index) => (
          <Animated.View
            key={bullet}
            entering={FadeInDown.duration(220).delay(150 + index * 80)}
            style={styles.bulletRow}
          >
            <Icon name="checkmark-circle" size={20} color={colors.accent} />
            <ThemedText variant="body" color="secondary" style={styles.bulletText}>
              {bullet}
            </ThemedText>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.duration(240).delay(420)} style={styles.actions}>
        <PressableScale
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => {
            haptic('light');
            router.push('/register');
          }}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          <ThemedText variant="titleMedium" style={{ color: colors.background }}>
            Create account
          </ThemedText>
        </PressableScale>
        <PressableScale
          style={[styles.secondaryButton, { backgroundColor: colors.surface, borderColor: colors.outline }]}
          onPress={() => {
            haptic('light');
            router.push('/login');
          }}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <ThemedText variant="titleMedium" color="accent">
            Log in
          </ThemedText>
        </PressableScale>
        <Pressable
          hitSlop={12}
          onPress={continueOffline}
          accessibilityRole="button"
          accessibilityLabel="Continue without account"
          style={styles.skipRow}
        >
          <ThemedText variant="bodySmall" color="accent">
            Continue without account
          </ThemedText>
          <Icon name="arrow-forward" size={14} color={colors.accent} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  hero: { alignItems: 'center', gap: 12 },
  logo: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '600', letterSpacing: 0.2 },
  tagline: { textAlign: 'center' },
  bullets: { gap: 14, alignSelf: 'stretch' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletText: { flex: 1 },
  actions: { gap: 10 },
  primaryButton: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  skipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
});
