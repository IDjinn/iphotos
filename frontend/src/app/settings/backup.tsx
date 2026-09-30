import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useAccountStore } from '@/stores/account';
import { useBackupStore } from '@/stores/backup';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

export default function BackupSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mode = useAccountStore((s) => s.mode);
  const backup = useBackupStore();
  const refreshStats = useBackupStore((s) => s.refreshStats);
  const startBackup = useBackupStore((s) => s.start);
  const startScan = useBackupStore((s) => s.scan);

  useEffect(() => {
    refreshStats();
    const unsubscribe = useBackupStore.subscribe((state, prev) => {
      if ((!state.scanning && prev.scanning) || (!state.running && prev.running)) state.refreshStats();
    });
    return unsubscribe;
  }, [refreshStats]);

  const stats = backup.stats;
  const busy = backup.running || backup.scanning;
  const progress = backup.progress;
  const caption = backup.scanning
    ? backup.scanProgress
      ? backup.scanProgress.total > 0
        ? `${
            backup.scanProgress.phase === 'scanning' ? 'Scanning' : 'Hashing'
          }… ${formatCount(Math.min(backup.scanProgress.processed, backup.scanProgress.total))} of ${formatCount(
            backup.scanProgress.total
          )}`
        : backup.scanProgress.phase === 'scanning'
          ? 'Scanning your library…'
          : 'Hashing your photos…'
      : 'Starting…'
    : backup.running
      ? progress
        ? progress.phase === 'inventory'
          ? 'Scanning your library…'
          : progress.phase === 'hashing'
            ? `Hashing ${formatCount(progress.processed)} of ${formatCount(progress.total)}…`
            : progress.total > 0
              ? `Backing up ${formatCount(Math.min(progress.processed, progress.total))} of ${formatCount(
                  progress.total
                )}${progress.failed > 0 ? ` · ${formatCount(progress.failed)} failed` : ''}`
              : 'Backing up…'
        : 'Starting…'
      : null;

  const breakdown: { label: string; count: number; bytes: number | null }[] = stats
    ? [
        { label: 'Backed up', count: stats.byState.uploaded, bytes: stats.uploadedBytes },
        {
          label: 'To back up',
          count: stats.byState.pending + stats.byState.hashing + stats.byState.queued + stats.byState.uploading,
          bytes: stats.pendingBytes,
        },
        { label: 'Failed', count: stats.byState.failed, bytes: null },
        { label: 'Excluded', count: stats.byState.excluded, bytes: null },
      ]
    : [];

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
          Backup
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
          {stats && stats.totalItems > 0 ? (
            <>
              <View style={styles.usageHeader}>
                <ThemedText variant="body">Local inventory</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {formatBytes(stats.totalBytes)}
                </ThemedText>
              </View>
              <ThemedText variant="bodySmall" color="secondary">
                {formatCount(stats.totalItems)} photos tracked on this device · {formatBytes(stats.uploadedBytes)}{' '}
                backed up
              </ThemedText>
              {breakdown
                .filter((row) => row.count > 0)
                .map((row) => (
                  <View key={row.label} style={styles.breakdownRow}>
                    <ThemedText variant="bodySmall" color="secondary">
                      {row.label}
                    </ThemedText>
                    <ThemedText variant="bodySmall">
                      {formatCount(row.count)}
                      {row.bytes !== null && row.bytes > 0 ? ` · ${formatBytes(row.bytes)}` : ''}
                    </ThemedText>
                  </View>
                ))}
            </>
          ) : (
            <ThemedText variant="bodySmall" color="secondary">
              {backup.scanning ? 'Building your inventory…' : 'No inventory yet — run a scan to index your photos.'}
            </ThemedText>
          )}
        </View>

        {caption ? (
          <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <ThemedText variant="bodySmall" color="secondary">
                {caption}
              </ThemedText>
            </View>
            {backup.running && progress && progress.phase === 'uploading' && progress.total > 0 ? (
              <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
                <View
                  style={[
                    styles.usageFill,
                    {
                      backgroundColor: colors.accent,
                      flex: Math.max(
                        0.02,
                        (progress.processed - progress.failed) / Math.max(1, progress.total)
                      ),
                    },
                  ]}
                />
                <View style={{ flex: 1 - Math.min(1, progress.processed / Math.max(1, progress.total)) }} />
              </View>
            ) : null}
          </View>
        ) : null}

        {backup.lastError ? (
          <ThemedText variant="bodySmall" color="danger" style={styles.error}>
            {backup.lastError}
          </ThemedText>
        ) : null}
        {backup.scanError ? (
          <ThemedText variant="bodySmall" color="danger" style={styles.error}>
            {backup.scanError}
          </ThemedText>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
          onPress={() => {
            haptic('light');
            if (!busy) void startScan();
          }}
          disabled={busy}
          accessibilityLabel="Scan your library"
        >
          <Icon name="refresh-outline" size={22} color={colors.icon} />
          <View style={styles.cardText}>
            <ThemedText variant="body">Scan now</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              Index your photos and find what changed — works offline
            </ThemedText>
          </View>
          {backup.scanning ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface },
            (mode !== 'cloud' || busy) && { opacity: 0.6 },
            pressed && { opacity: 0.75 },
          ]}
          onPress={() => {
            haptic('medium');
            if (!busy) void startBackup();
          }}
          disabled={busy || mode !== 'cloud'}
          accessibilityLabel="Back up photos"
        >
          <Icon name="cloud-upload-outline" size={22} color={mode === 'cloud' ? colors.accent : colors.iconInactive} />
          <View style={styles.cardText}>
            <ThemedText variant="body">Back up now</ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {mode === 'cloud'
                ? 'Upload everything new to the cloud'
                : 'Requires Cloud mode — log in to back up your photos'}
            </ThemedText>
          </View>
          {backup.running ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          )}
        </Pressable>

        <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
          The inventory tracks the size, modification time and content hash of each photo, so unchanged photos
          are never re-hashed or re-uploaded. Items in the Locked Folder and the Safe Folder never enter the
          backup.
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
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  error: { lineHeight: 18 },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
