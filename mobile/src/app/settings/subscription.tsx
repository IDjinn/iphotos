import { useCallback, useEffect, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Card,
  CardColumn,
  CardText,
  CurrentBadge,
  Header,
  HeaderSpacer,
  HeaderTitle,
  LoadingCard,
  Note,
  PlanCard,
  PlanHeader,
  PlanTitle,
  BenefitRow,
  Screen,
  SubscribeButton,
  SubscribeLabel,
} from '@/screens/settings/subscription.styles';
import {
  getBillingCatalog,
  getBillingStatus,
  lastPurchaseToken,
  rememberPurchaseToken,
  restorePurchase,
  sandboxPurchaseToken,
  verifyPurchase,
  type BillingCatalog,
  type BillingStatus,
} from '@/data/billing';
import { useAccountStore } from '@/stores/account';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

/** Date label for the current/last term end ("Dec 30, 2026"). */
function termDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SubscriptionScreen() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refreshPlan = useAccountStore((s) => s.refreshPlan);

  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'subscribe' | 'restore' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([getBillingCatalog(), getBillingStatus()])
      .then(([nextCatalog, nextStatus]) => {
        setCatalog(nextCatalog);
        setStatus(nextStatus);
        setLoadError(null);
      })
      .catch(() => setLoadError('Could not load subscription plans — check your connection and try again.'));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const subscribed = status?.state === 'Active' || status?.state === 'Grace';

  const subscribe = async (productId: string) => {
    haptic('medium');
    setBusy('subscribe');
    setActionError(null);
    try {
      // In the sandbox the "purchase" is simulated; the verification round-trip
      // is the same one a native store purchase token goes through.
      const token = sandboxPurchaseToken();
      const next = await verifyPurchase(productId, token);
      rememberPurchaseToken(token);
      setStatus(next);
      void refreshPlan();
    } catch {
      setActionError('The purchase could not be confirmed — try again.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    const token = lastPurchaseToken();
    if (!token) {
      setActionError('There is no purchase linked to this account yet.');
      return;
    }
    haptic('light');
    setBusy('restore');
    setActionError(null);
    try {
      const next = await restorePurchase(token);
      setStatus(next);
      void refreshPlan();
    } catch {
      setActionError('No purchase could be restored for this account.');
    } finally {
      setBusy(null);
    }
  };

  const stateLabel =
    status?.state === 'Active'
      ? `Active · renews ${termDate(status.expiresAt)}`
      : status?.state === 'Grace'
        ? `Payment issue · access ends ${termDate(status.expiresAt)}`
        : status?.state === 'Expired'
          ? `Expired ${termDate(status.expiresAt)}`
          : null;

  return (
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">iPhotos Cloud</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Body>
        {loadError ? (
          <>
            <ThemedText variant="bodySmall" color="danger">
              {loadError}
            </ThemedText>
            <ActionCard
              onPress={() => {
                haptic('light');
                reload();
              }}
              accessibilityLabel="Try again"
            >
              <Icon name="refresh-outline" size={22} color={colors.icon} />
              <ThemedText variant="body">Try again</ThemedText>
            </ActionCard>
          </>
        ) : !catalog || !status ? (
          <LoadingCard>
            <ActivityIndicator color={colors.accent} />
            <ThemedText variant="bodySmall" color="secondary">
              Loading your plan…
            </ThemedText>
          </LoadingCard>
        ) : (
          <>
            {subscribed && status.state === 'Active' ? (
              <PlanCard>
                <Icon name="cloud-done-outline" size={40} color={colors.accent} />
                <PlanTitle variant="body" color="accent">
                  You&apos;re on iPhotos Cloud
                </PlanTitle>
                <ThemedText variant="bodySmall" color="secondary">
                  {stateLabel}
                </ThemedText>
              </PlanCard>
            ) : null}

            {catalog.products.map((item) => {
              const isCurrentPlan = subscribed && status.plan === item.productId;
              return (
                <CardColumn key={item.productId}>
                  <PlanHeader>
                    <CardText>
                      <ThemedText variant="body">{item.displayName}</ThemedText>
                      <ThemedText variant="bodySmall" color="secondary">
                        {formatBytes(item.quotaBytes)} of cloud storage for your photos
                      </ThemedText>
                    </CardText>
                    <ThemedText variant="titleMedium" color="accent">
                      {item.displayPrice}
                    </ThemedText>
                  </PlanHeader>

                  <BenefitRow>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Automatic backup with deduplication — each photo is stored once
                    </ThemedText>
                  </BenefitRow>
                  <BenefitRow>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Your full timeline on every device, with restore
                    </ThemedText>
                  </BenefitRow>
                  <BenefitRow>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Your photos stay yours — download or delete them anytime
                    </ThemedText>
                  </BenefitRow>

                  {isCurrentPlan ? (
                    <CurrentBadge>
                      <ThemedText variant="bodySmall" color="accent">
                        {status.state === 'Active' ? 'Current plan' : 'Current plan — payment issue'}
                      </ThemedText>
                    </CurrentBadge>
                  ) : (
                    <SubscribeRow
                      label={subscribed ? 'Switch plan' : 'Subscribe'}
                      busy={busy === 'subscribe'}
                      disabled={busy !== null}
                      onPress={() => void subscribe(item.productId)}
                      accessibilityLabel={`Subscribe to ${item.displayName}`}
                    />
                  )}
                </CardColumn>
              );
            })}

            {status.state === 'Expired' ? (
              <Note variant="bodySmall" color="secondary">
                Your subscription expired on {termDate(status.expiresAt)}. Nothing was deleted —
                subscribe again to keep backing up.
              </Note>
            ) : null}

            <ActionCard
              onPress={() => void restore()}
              disabled={busy !== null}
              accessibilityLabel="Restore purchase"
            >
              {busy === 'restore' ? (
                <ActivityIndicator size="small" color={colors.icon} />
              ) : (
                <Icon name="refresh-circle-outline" size={22} color={colors.icon} />
              )}
              <CardText>
                <ThemedText variant="body">Restore purchase</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  Re-linked after reinstalling or signing in again
                </ThemedText>
              </CardText>
            </ActionCard>

            {actionError ? (
              <ThemedText variant="bodySmall" color="danger">
                {actionError}
              </ThemedText>
            ) : null}

            {catalog.sandbox ? (
              <Note variant="bodySmall" color="secondary">
                Sandbox build — purchases are simulated and never charged.
              </Note>
            ) : null}
          </>
        )}
      </Body>
    </Screen>
  );
}

/** Action row card with press feedback. */
function ActionCard({
  onPress,
  disabled,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Card
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Card>
  );
}

/** Subscribe button with press feedback and busy spinner. */
function SubscribeRow({
  label,
  busy,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const [pressed, setPressed] = useState(false);
  const { colors } = useTheme();
  return (
    <SubscribeButton
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      {busy ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : (
        <SubscribeLabel variant="body" color="inverse">
          {label}
        </SubscribeLabel>
      )}
    </SubscribeButton>
  );
}
