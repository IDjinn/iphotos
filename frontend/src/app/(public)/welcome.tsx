import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import {
  Actions,
  BulletRow,
  BulletText,
  Bullets,
  Container,
  Hero,
  Logo,
  PrimaryButton,
  SecondaryButton,
  SkipRow,
  Tagline,
  Title,
} from '@/screens/(public)/welcome.styles';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n/hook';
import { useOnboardingStore } from '@/stores/onboarding';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const BULLETS: TranslationKey[] = [
  'auth.welcome.bulletOffline',
  'auth.welcome.bulletE2E',
  'auth.welcome.bulletSmartSearch',
];

export default function WelcomeScreen() {
  const { colors, space } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  const continueOffline = () => {
    haptic('light');
    complete('offline');
    router.replace('/');
  };

  return (
    <Container
      $insetTop={insets.top + space[8]}
      $insetBottom={insets.bottom + space[7]}
    >
      <Hero entering={FadeInDown.duration(300)}>
        <Logo>
          <Icon name="images" size={44} color={colors.accent} />
        </Logo>
        <Title variant="display">iPhotos</Title>
        <Tagline variant="body" color="secondary">
          {t('auth.welcome.tagline')}
        </Tagline>
      </Hero>

      <Bullets>
        {BULLETS.map((bullet, index) => (
          <BulletRow key={bullet} entering={FadeInDown.duration(220).delay(150 + index * 80)}>
            <Icon name="checkmark-circle" size={20} color={colors.accent} />
            <BulletText variant="body" color="secondary">
              {t(bullet)}
            </BulletText>
          </BulletRow>
        ))}
      </Bullets>

      <Actions entering={FadeInDown.duration(240).delay(420)}>
        <PrimaryButton
          onPress={() => {
            haptic('light');
            router.push('/register');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('auth.createAccount')}
        >
          <ThemedText variant="titleMedium" color="inverse">
            {t('auth.createAccount')}
          </ThemedText>
        </PrimaryButton>
        <SecondaryButton
          onPress={() => {
            haptic('light');
            router.push('/login');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('auth.logIn')}
        >
          <ThemedText variant="titleMedium" color="accent">
            {t('auth.logIn')}
          </ThemedText>
        </SecondaryButton>
        <PressableSkipRow onPress={continueOffline} label={t('auth.continueWithoutAccount')} />
      </Actions>
    </Container>
  );
}

function PressableSkipRow({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <SkipRow
      hitSlop={12}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ThemedText variant="bodySmall" color="accent">
        {label}
      </ThemedText>
      <Icon name="arrow-forward" size={14} color={colors.accent} />
    </SkipRow>
  );
}
