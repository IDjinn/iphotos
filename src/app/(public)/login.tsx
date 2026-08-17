import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { LabeledInput } from '@/components/LabeledInput';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { useOnboardingStore } from '@/stores/onboarding';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [unavailable, setUnavailable] = useState(false);

  const submit = () => {
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (password.length === 0) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      // Cloud auth arrives with the phase-3 backend (docs/plans/03-backup-e2e.md §10).
      haptic('medium');
      setUnavailable(true);
    }
  };

  const continueOffline = () => {
    complete('offline');
    router.replace('/');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          Log in
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <Animated.View entering={FadeInDown.duration(200)} style={styles.form}>
        <LabeledInput
          label="E-mail"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setUnavailable(false);
          }}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <LabeledInput
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setUnavailable(false);
          }}
          error={errors.password}
          secureTextEntry
          autoComplete="password"
        />
        <Pressable hitSlop={8} onPress={() => setUnavailable(true)} accessibilityRole="button">
          <ThemedText variant="bodySmall" color="accent" style={styles.forgot}>
            Forgot password?
          </ThemedText>
        </Pressable>

        <PressableScale
          style={[styles.submit, { backgroundColor: colors.accent }]}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <ThemedText variant="titleMedium" style={{ color: colors.background }}>
            Log in
          </ThemedText>
        </PressableScale>

        {unavailable ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            style={[styles.banner, { backgroundColor: colors.accentSoft }]}
          >
            <Icon name="cloud-offline-outline" size={20} color={colors.accent} />
            <View style={styles.bannerText}>
              <ThemedText variant="bodySmall" color="secondary">
                Cloud service is not available yet — you can continue in offline mode.
              </ThemedText>
              <Pressable
                hitSlop={8}
                onPress={continueOffline}
                accessibilityRole="button"
                accessibilityLabel="Continue offline"
              >
                <ThemedText variant="bodySmall" color="accent" style={styles.bannerAction}>
                  Continue offline
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  form: { paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  forgot: { alignSelf: 'flex-end' },
  submit: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  banner: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  bannerText: { flex: 1, gap: 8 },
  bannerAction: { fontWeight: '600' },
});
