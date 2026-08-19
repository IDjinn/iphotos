import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { LabeledInput } from '@/components/LabeledInput';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { register } from '@/data/api-client';
import { authErrorMessage } from '@/data/auth-errors';
import { useAccountStore } from '@/stores/account';
import { useOnboardingStore } from '@/stores/onboarding';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface RegisterErrors {
  email?: string;
  password?: string;
  confirm?: string;
  ack?: string;
}

export default function RegisterScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const next: RegisterErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (password.length < 8 || !/\d/.test(password)) {
      next.password = 'Use at least 8 characters, including one number.';
    }
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    if (!ack) next.ack = 'Please confirm you understand.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    haptic('medium');
    setSubmitting(true);
    setUnavailable(null);
    try {
      const user = await register(email.trim(), password, name.trim() || undefined);
      useAccountStore.getState().signIn(user);
      complete('cloud');
      router.replace('/');
    } catch (error) {
      setUnavailable(authErrorMessage(error));
    } finally {
      setSubmitting(false);
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
          Create account
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <Animated.View entering={FadeInDown.duration(200)} style={styles.form}>
        <LabeledInput
          label="Name (optional)"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
        />
        <LabeledInput
          label="E-mail"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setUnavailable(null);
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
            setUnavailable(null);
          }}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
        />
        <LabeledInput
          label="Confirm password"
          value={confirm}
          onChangeText={(text) => {
            setConfirm(text);
            setUnavailable(null);
          }}
          error={errors.confirm}
          secureTextEntry
          autoComplete="new-password"
        />

        <Pressable
          style={styles.ackRow}
          onPress={() => {
            haptic('light');
            setAck((value) => !value);
            setErrors((current) => ({ ...current, ack: undefined }));
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ack }}
          accessibilityLabel="Acknowledge encrypted backup recovery"
        >
          <Icon name={ack ? 'checkbox' : 'square-outline'} size={22} color={ack ? colors.accent : colors.iconInactive} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.ackText}>
            I understand that password reset is not available yet — losing my password
            will make my cloud backups unrecoverable.
          </ThemedText>
        </Pressable>
        {errors.ack ? (
          <ThemedText variant="bodySmall" color="danger">
            {errors.ack}
          </ThemedText>
        ) : null}

        <PressableScale
          style={[styles.submit, { backgroundColor: colors.accent }]}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Create account"
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText variant="titleMedium" style={{ color: colors.background }}>
              Create account
            </ThemedText>
          )}
        </PressableScale>

        {unavailable ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            style={[styles.banner, { backgroundColor: colors.accentSoft }]}
          >
            <Icon name="cloud-offline-outline" size={20} color={colors.accent} />
            <View style={styles.bannerText}>
              <ThemedText variant="bodySmall" color="secondary">
                {unavailable}
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
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ackText: { flex: 1, lineHeight: 18 },
  submit: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  banner: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  bannerText: { flex: 1, gap: 8 },
  bannerAction: { fontWeight: '600' },
});
