import { useEffect, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { API_URL } from '@/data/api-client';
import { getUsage, type CloudUsage } from '@/data/cloud-photos-repository';
import { useAccountStore } from '@/stores/account';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Card,
  CardColumn,
  CardText,
  Header,
  HeaderSpacer,
  HeaderTitle,
  LoadingRow,
  Note,
  Screen,
  UsageBar,
  UsageFill,
  UsageHeader,
  UsageRemainder,
} from '@/app/settings/account.styles';
import { useTranslation } from '@/i18n/hook';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function renewDateLabel(epoch: number | undefined, localeTag: string): string {
  if (!epoch) return '—';
  return new Date(epoch).toLocaleDateString(localeTag, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AccountSettingsScreen() {
  const { colors, space } = useTheme();
  const { t, tCount, localeTag } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAccountStore((s) => s.user);
  const plan = useAccountStore((s) => s.plan);
  const refreshPlan = useAccountStore((s) => s.refreshPlan);
  const signOut = useAccountStore((s) => s.signOut);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUsage()
      .then((value) => !cancelled && setUsage(value))
      .catch(() => !cancelled && setUsageError(t('account.usageError')));
    void refreshPlan();
    return () => {
      cancelled = true;
    };
  }, [refreshPlan, t]);

  const confirmSignOut = () => {
    haptic('medium');
    Alert.alert(t('account.signOut'), t('account.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: () => {
          signOut();
          router.back();
        },
      },
    ]);
  };

  const usedFraction = usage ? Math.min(1, usage.usedBytes / Math.max(1, usage.quotaBytes)) : 0;

  return (
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('account.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Body>
        <StaticCard>
          <Icon name="person-circle-outline" size={40} color={colors.accent} />
          <CardText>
            <ThemedText variant="body">{user?.email ?? t('account.notSignedIn')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {t('account.cloudHost', { host: hostOf(API_URL) })}
            </ThemedText>
          </CardText>
        </StaticCard>

        <CardColumn>
          {usageError ? (
            <ThemedText variant="bodySmall" color="danger">
              {usageError}
            </ThemedText>
          ) : usage ? (
            <>
              <UsageHeader>
                <ThemedText variant="body">{t('account.storage')}</ThemedText>
                {usage ? (
                  <ThemedText variant="bodySmall" color="secondary">
                    {`${formatBytes(usage.usedBytes)} ${t('units.of')} ${formatBytes(usage.quotaBytes)}`}
                  </ThemedText>
                ) : null}
              </UsageHeader>
              <UsageBar>
                <UsageFill $fraction={usedFraction} />
                <UsageRemainder $fraction={1 - usedFraction} />
              </UsageBar>
              <ThemedText variant="bodySmall" color="secondary">
                {tCount('account.photosBackedUp', usage.photoCount, {
                  count: usage.photoCount.toLocaleString(localeTag),
                })}
              </ThemedText>
            </>
          ) : (
            <LoadingRow>
              <ActivityIndicator color={colors.accent} />
              <ThemedText variant="bodySmall" color="secondary">
                {t('account.loadingUsage')}
              </ThemedText>
            </LoadingRow>
          )}
        </CardColumn>

        <PressableCard
          onPress={() => {
            haptic('light');
            router.push('/settings/subscription');
          }}
          accessibilityLabel={t('settings.account.subscriptionA11y')}
        >
          <Icon
            name={plan ? 'cloud-done-outline' : 'cloud-circle-outline'}
            size={22}
            color={plan ? colors.accent : colors.icon}
          />
          <CardText>
            <ThemedText variant="body">{plan ? plan.label : t('settings.account.iPhotosCloud')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {plan
                ? t('account.planActive', { date: renewDateLabel(plan.renewsAt, localeTag) })
                : t('settings.account.addStorage')}
            </ThemedText>
          </CardText>
          <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
        </PressableCard>

        <PressableCard
          onPress={() => {
            haptic('light');
            router.push('/cloud-photos');
          }}
          accessibilityLabel={t('account.photosInCloud')}
        >
          <Icon name="cloud-outline" size={22} color={colors.icon} />
          <CardText>
            <ThemedText variant="body">{t('account.photosInCloud')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {t('account.photosInCloudSubtitle')}
            </ThemedText>
          </CardText>
          <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
        </PressableCard>

        <PressableCard danger onPress={confirmSignOut} accessibilityLabel={t('account.signOut')}>
          <Icon name="log-out-outline" size={22} color={colors.danger} />
          <ThemedText variant="body" color="danger">
            {t('account.signOut')}
          </ThemedText>
        </PressableCard>

        <Note variant="bodySmall" color="secondary">
          {t('account.passwordNote', { version: Constants.expoConfig?.version ?? '0.1.0' })}
        </Note>
      </Body>
    </Screen>
  );
}

/** Non-interactive card block (profile header). */
function StaticCard({ children }: { children: React.ReactNode }) {
  return <Card $pressed={false}>{children}</Card>;
}

/** Pressable settings card with pressed feedback. */function PressableCard({
  onPress,
  danger,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Card
      $pressed={pressed}
      $danger={danger}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Card>
  );
}
