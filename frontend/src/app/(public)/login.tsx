import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { LabeledInput } from '@/components/LabeledInput';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import {
  Banner,
  BannerAction,
  BannerText,
  Forgot,
  Form,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Screen,
  Submit,
} from '@/app/(public)/auth.styles';
import { login } from '@/data/api-client';
import { authErrorMessage } from '@/data/auth-errors';
import { useTranslation } from '@/i18n/hook';
import { useAccountStore } from '@/stores/account';
import { useOnboardingStore } from '@/stores/onboarding';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

export default function LoginScreen() {
  const { colors, space } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('auth.validation.email');
    if (password.length === 0) next.password = t('auth.validation.passwordRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    haptic('medium');
    setSubmitting(true);
    setUnavailable(null);
    try {
      const user = await login(email.trim(), password);
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
    <Screen
      contentContainerStyle={{ paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[8] }}
      keyboardShouldPersistTaps="handled"
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('auth.logIn')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Form entering={FadeInDown.duration(200)}>
        <LabeledInput
          label={t('auth.emailLabel')}
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
          label={t('auth.passwordLabel')}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setUnavailable(null);
          }}
          error={errors.password}
          secureTextEntry
          autoComplete="password"
        />
        <Pressable
          hitSlop={8}
          onPress={() => setUnavailable(t('auth.login.resetUnavailable'))}
          accessibilityRole="button"
        >
          <Forgot variant="bodySmall" color="accent">
            {t('auth.login.forgotPassword')}
          </Forgot>
        </Pressable>

        <Submit
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={t('auth.logIn')}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText variant="titleMedium" color="inverse">
              {t('auth.logIn')}
            </ThemedText>
          )}
        </Submit>

        {unavailable ? (
          <Banner entering={FadeIn.duration(160)}>
            <Icon name="cloud-offline-outline" size={20} color={colors.accent} />
            <BannerText>
              <ThemedText variant="bodySmall" color="secondary">
                {unavailable}
              </ThemedText>
              <Pressable
                hitSlop={8}
                onPress={continueOffline}
                accessibilityRole="button"
                accessibilityLabel={t('auth.continueOffline')}
              >
                <BannerAction variant="bodySmall" color="accent">
                  {t('auth.continueOffline')}
                </BannerAction>
              </Pressable>
            </BannerText>
          </Banner>
        ) : null}
      </Form>
    </Screen>
  );
}
