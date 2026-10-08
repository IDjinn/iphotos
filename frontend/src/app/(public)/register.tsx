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
  AckRow,
  AckText,
  Banner,
  BannerAction,
  BannerText,
  Form,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Screen,
  Submit,
} from '@/screens/(public)/auth.styles';
import { register } from '@/data/api-client';
import { authErrorMessage } from '@/data/auth-errors';
import { useTranslation } from '@/i18n/hook';
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
  const { colors, space } = useTheme();
  const { t } = useTranslation();
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
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('auth.validation.email');
    if (password.length < 8 || !/\d/.test(password)) {
      next.password = t('auth.validation.passwordWeak');
    }
    if (confirm !== password) next.confirm = t('auth.validation.passwordMismatch');
    if (!ack) next.ack = t('auth.validation.ackRequired');
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
    <Screen
      contentContainerStyle={{ paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[8] }}
      keyboardShouldPersistTaps="handled"
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('auth.createAccount')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Form entering={FadeInDown.duration(200)}>
        <LabeledInput
          label={t('auth.register.nameLabel')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <LabeledInput
          label={t('auth.register.confirmPasswordLabel')}
          value={confirm}
          onChangeText={(text) => {
            setConfirm(text);
            setUnavailable(null);
          }}
          error={errors.confirm}
          secureTextEntry
          autoComplete="new-password"
        />

        <AckRow
          onPress={() => {
            haptic('light');
            setAck((value) => !value);
            setErrors((current) => ({ ...current, ack: undefined }));
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ack }}
          accessibilityLabel={t('auth.register.ackA11y')}
        >
          <Icon name={ack ? 'checkbox' : 'square-outline'} size={22} color={ack ? colors.accent : colors.iconInactive} />
          <AckText variant="bodySmall" color="secondary">
            {t('auth.register.ackBody')}
          </AckText>
        </AckRow>
        {errors.ack ? (
          <ThemedText variant="bodySmall" color="danger">
            {errors.ack}
          </ThemedText>
        ) : null}

        <Submit
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={t('auth.createAccount')}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText variant="titleMedium" color="inverse">
              {t('auth.createAccount')}
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
