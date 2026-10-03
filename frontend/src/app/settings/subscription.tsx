import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
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
  const { colors } = useTheme();
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
    >
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          iPhotos Cloud
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {loadError ? (
          <>
            <ThemedText variant="bodySmall" color="danger">
              {loadError}
            </ThemedText>
            <Pressable
              style={({ pressed }) => [styles.card, styles.actionCard, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
              onPress={() => {
                haptic('light');
                reload();
              }}
              accessibilityLabel="Try again"
            >
              <Icon name="refresh-outline" size={22} color={colors.icon} />
              <ThemedText variant="body">Try again</ThemedText>
            </Pressable>
          </>
        ) : !catalog || !status ? (
          <View style={[styles.card, styles.loadingCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText variant="bodySmall" color="secondary">
              Loading your plan…
            </ThemedText>
          </View>
        ) : (
          <>
            {subscribed && status.state === 'Active' ? (
              <View style={[styles.card, styles.planCard, { backgroundColor: colors.accentSoft }]}>
                <Icon name="cloud-done-outline" size={40} color={colors.accent} />
                <ThemedText variant="body" color="accent" style={styles.planTitle}>
                  You&apos;re on iPhotos Cloud
                </ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {stateLabel}
                </ThemedText>
              </View>
            ) : null}

            {catalog.products.map((item) => {
              const isCurrentPlan = subscribed && status.plan === item.productId;
              return (
                <View key={item.productId} style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
                  <View style={styles.planHeader}>
                    <View style={styles.cardText}>
                      <ThemedText variant="body">{item.displayName}</ThemedText>
                      <ThemedText variant="bodySmall" color="secondary">
                        {formatBytes(item.quotaBytes)} of cloud storage for your photos
                      </ThemedText>
                    </View>
                    <ThemedText variant="titleMedium" color="accent">
                      {item.displayPrice}
                    </ThemedText>
                  </View>

                  <View style={styles.benefitRow}>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Automatic backup with deduplication — each photo is stored once
                    </ThemedText>
                  </View>
                  <View style={styles.benefitRow}>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Your full timeline on every device, with restore
                    </ThemedText>
                  </View>
                  <View style={styles.benefitRow}>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      Your photos stay yours — download or delete them anytime
                    </ThemedText>
                  </View>

                  {isCurrentPlan ? (
                    <View style={[styles.currentBadge, { borderColor: colors.accent }]}>
                      <ThemedText variant="bodySmall" color="accent">
                        {status.state === 'Active' ? 'Current plan' : 'Current plan — payment issue'}
                      </ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.subscribeButton,
                        { backgroundColor: colors.accent },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => void subscribe(item.productId)}
                      disabled={busy !== null}
                      accessibilityLabel={`Subscribe to ${item.displayName}`}
                    >
                      {busy === 'subscribe' ? (
                        <ActivityIndicator color={colors.textInverse} />
                      ) : (
                        <ThemedText variant="body" style={[styles.subscribeLabel, { color: colors.textInverse }]}>
                          {subscribed ? 'Switch plan' : 'Subscribe'}
                        </ThemedText>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}

            {status.state === 'Expired' ? (
              <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
                Your subscription expired on {termDate(status.expiresAt)}. Nothing was deleted —
                subscribe again to keep backing up.
              </ThemedText>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.card, styles.actionCard, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
              onPress={() => void restore()}
              disabled={busy !== null}
              accessibilityLabel="Restore purchase"
            >
              {busy === 'restore' ? (
                <ActivityIndicator size="small" color={colors.icon} />
              ) : (
                <Icon name="refresh-circle-outline" size={22} color={colors.icon} />
              )}
              <View style={styles.cardText}>
                <ThemedText variant="body">Restore purchase</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  Re-linked after reinstalling or signing in again
                </ThemedText>
              </View>
            </Pressable>

            {actionError ? (
              <ThemedText variant="bodySmall" color="danger">
                {actionError}
              </ThemedText>
            ) : null}

            {catalog.sandbox ? (
              <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
                Sandbox build — purchases are simulated and never charged.
              </ThemedText>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardColumn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  cardText: { flex: 1, gap: 2 },
  loadingCard: { flexDirection: 'row', justifyContent: 'center' },
  actionCard: { paddingVertical: 12 },
  planCard: { alignItems: 'center', gap: 4 },
  planTitle: { fontWeight: '600' },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentBadge: { borderRadius: 10, borderWidth: 1.5, alignItems: 'center', paddingVertical: 8 },
  subscribeButton: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  subscribeLabel: { fontWeight: '600' },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
