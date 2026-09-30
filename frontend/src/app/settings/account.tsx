import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { API_URL } from '@/data/api-client';
import { getUsage, type CloudUsage } from '@/data/cloud-photos-repository';
import { useAccountStore } from '@/stores/account';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function AccountSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAccountStore((s) => s.user);
  const signOut = useAccountStore((s) => s.signOut);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUsage()
      .then((value) => !cancelled && setUsage(value))
      .catch(() => !cancelled && setUsageError('Could not load usage — try again later.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmSignOut = () => {
    haptic('medium');
    Alert.alert('Sign out', 'Cloud sync stops, but your local photos stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
    >
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          Account
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Icon name="person-circle-outline" size={40} color={colors.accent} />
          <View style={styles.cardText}>
            <ThemedText variant="body">{user?.email ?? 'Not signed in'}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              Cloud · {hostOf(API_URL)}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
          {usageError ? (
            <ThemedText variant="bodySmall" color="danger">
              {usageError}
            </ThemedText>
          ) : usage ? (
            <>
              <View style={styles.usageHeader}>
                <ThemedText variant="body">Storage</ThemedText>
                {usage ? (
                  <ThemedText variant="bodySmall" color="secondary">
                    {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)}
                  </ThemedText>
                ) : null}
              </View>
              <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
                <View
                  style={[styles.usageFill, { backgroundColor: colors.accent, flex: usedFraction }]}
                />
                <View style={{ flex: 1 - usedFraction }} />
              </View>
              <ThemedText variant="bodySmall" color="secondary">
                {usage.photoCount.toLocaleString('en-US')} photos backed up
              </ThemedText>
            </>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <ThemedText variant="bodySmall" color="secondary">
                Loading usage…
              </ThemedText>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
          onPress={() => {
            haptic('light');
            router.push('/cloud-photos');
          }}
          accessibilityLabel="Photos in the cloud"
        >
          <Icon name="cloud-outline" size={22} color={colors.icon} />
          <View style={styles.cardText}>
            <ThemedText variant="body">Photos in the cloud</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              Browse, download or delete your backups
            </ThemedText>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.75, borderColor: colors.danger }]}
          onPress={confirmSignOut}
          accessibilityLabel="Sign out"
        >
          <Icon name="log-out-outline" size={22} color={colors.danger} />
          <ThemedText variant="body" color="danger">
            Sign out
          </ThemedText>
        </Pressable>

        <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
          Password change is not available yet — it arrives in a future update. Version{' '}
          {Constants.expoConfig?.version ?? '0.1.0'}.
        </ThemedText>
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
  cardText: { flex: 1, gap: 2 },
  cardColumn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usageBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  usageFill: { borderRadius: 4 },
  loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
