import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { getUsage, type CloudUsage } from '@/data/cloud-photos-repository';
import { isExpoGo } from '@/data/native-crypto';
import type { BackupProgress } from '@/data/backup-engine';
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

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s left`;
  if (seconds < 3600) return `~${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s left`;
  return `~${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m left`;
}

/**
 * Estimates remaining upload time from observed throughput: a short recent
 * window when steady progress is flowing, falling back to the overall
 * average. Re-renders once per second so the estimate ages visibly.
 */
function useBackupEta(progress: BackupProgress | null, running: boolean): string | null {
  const startedAtRef = useRef<number | null>(null);
  const samplesRef = useRef<{ t: number; processed: number }[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!running) {
      startedAtRef.current = null;
      samplesRef.current = [];
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && progress?.phase === 'uploading') {
      samplesRef.current.push({ t: Date.now(), processed: progress.processed });
    }
  }, [running, progress]);

  if (!running || !progress || progress.phase !== 'uploading' || progress.total === 0) return null;
  const done = Math.max(0, progress.processed - progress.failed);
  const remaining = progress.total - done;
  if (remaining <= 0) return null;

  const now = Date.now();
  const recent = samplesRef.current.filter((s) => s.t >= now - 30_000);
  const window = recent.length >= 2 ? recent : samplesRef.current;
  let etaSeconds: number | null = null;
  if (window.length >= 2) {
    const first = window[0];
    const last = window[window.length - 1];
    const dt = (last.t - first.t) / 1000;
    const dp = last.processed - first.processed;
    if (dt > 0 && dp > 0) etaSeconds = remaining / (dp / dt);
  }
  if (etaSeconds === null && startedAtRef.current !== null && done > 0) {
    etaSeconds = ((now - startedAtRef.current) / 1000 / done) * remaining;
  }
  if (etaSeconds === null || !Number.isFinite(etaSeconds)) return null;
  return formatEta(etaSeconds);
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
  // Expo Go cannot see the device gallery, so the whole inventory/scan/upload
  // flow is meaningless there — the screen turns into a cloud-only view.
  const cloudOnly = isExpoGo;
  const [usage, setUsage] = useState<CloudUsage | null>(null);

  useEffect(() => {
    if (cloudOnly) return;
    refreshStats();
    const unsubscribe = useBackupStore.subscribe((state, prev) => {
      if ((!state.scanning && prev.scanning) || (!state.running && prev.running)) state.refreshStats();
    });
    return unsubscribe;
  }, [refreshStats, cloudOnly]);

  // Refresh cloud usage on focus, so a finished ZIP import shows up at once.
  useFocusEffect(
    useCallback(() => {
      if (!cloudOnly) return;
      void getUsage()
        .then(setUsage)
        .catch(() => setUsage(null));
    }, [cloudOnly])
  );

  const stats = backup.stats;
  const busy = backup.running || backup.scanning;
  const progress = backup.progress;
  const eta = useBackupEta(progress, backup.running);

  const scanCaption = backup.scanning
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
    : null;

  const backupCaption = backup.running
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

  const scanBar = backup.scanning && backup.scanProgress && backup.scanProgress.total > 0
    ? Math.min(1, backup.scanProgress.processed / backup.scanProgress.total)
    : null;
  const backupBar =
    backup.running && progress && progress.total > 0 && progress.phase !== 'inventory'
      ? Math.min(
          1,
          progress.phase === 'uploading'
            ? Math.max(0, progress.processed - progress.failed) / progress.total
            : progress.processed / progress.total
        )
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
        {cloudOnly ? (
          <>
            <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
              <View style={styles.usageHeader}>
                <ThemedText variant="body">Cloud storage</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {usage ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}` : ' '}
                </ThemedText>
              </View>
              {usage && usage.quotaBytes > 0 ? (
                <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
                  <View
                    style={[
                      styles.usageFill,
                      { backgroundColor: colors.accent, flex: Math.max(0.02, Math.min(1, usage.usedBytes / usage.quotaBytes)) },
                    ]}
                  />
                  <View style={{ flex: Math.max(0, 1 - Math.min(1, usage.usedBytes / usage.quotaBytes)) }} />
                </View>
              ) : null}
              <ThemedText variant="bodySmall" color="secondary">
                {usage
                  ? `${formatCount(usage.photoCount)} photo${usage.photoCount === 1 ? '' : 's'} stored in your account`
                  : 'Could not reach the backend — sign in and try again.'}
              </ThemedText>
            </View>

            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
              onPress={() => {
                haptic('light');
                router.push('/settings/import-zip');
              }}
              accessibilityLabel="Add photos via ZIP import"
            >
              <View style={styles.cardRow}>
                <Icon name="archive-outline" size={22} color={colors.accent} />
                <View style={styles.cardText}>
                  <ThemedText variant="body">Add photos via ZIP import</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    Upload a ZIP (Google Takeout style) — processed on the server
                  </ThemedText>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
              </View>
            </Pressable>

            <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
              Scanning and uploading this phone&apos;s gallery needs the native build — the Expo Go preview client
              cannot access the device media library. Photos you import via ZIP appear in the cloud and on the
              Photos tab normally.
            </ThemedText>
          </>
        ) : (
          <>
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
          <View style={styles.cardRow}>
            <Icon name="refresh-outline" size={22} color={colors.icon} />
            <View style={styles.cardText}>
              <ThemedText variant="body">Scan now</ThemedText>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                {scanCaption ?? 'Index your photos and find what changed — works offline'}
              </ThemedText>
            </View>
            {backup.scanning ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            )}
          </View>
          {scanBar !== null ? (
            <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
              <View style={[styles.usageFill, { backgroundColor: colors.accent, flex: Math.max(0.02, scanBar) }]} />
              <View style={{ flex: 1 - scanBar }} />
            </View>
          ) : null}
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
          <View style={styles.cardRow}>
            <Icon
              name="cloud-upload-outline"
              size={22}
              color={mode === 'cloud' ? colors.accent : colors.iconInactive}
            />
            <View style={styles.cardText}>
              <ThemedText variant="body">Back up now</ThemedText>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                {backupCaption
                  ? eta
                    ? `${backupCaption} · ${eta}`
                    : backupCaption
                  : mode === 'cloud'
                    ? 'Upload everything new to the cloud'
                    : 'Requires Cloud mode — log in to back up your photos'}
              </ThemedText>
            </View>
            {backup.running ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            )}
          </View>
          {backupBar !== null ? (
            <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
              <View style={[styles.usageFill, { backgroundColor: colors.accent, flex: Math.max(0.02, backupBar) }]} />
              <View style={{ flex: 1 - backupBar }} />
            </View>
          ) : null}
        </Pressable>

        <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
          The inventory tracks the size, modification time and content hash of each photo, so unchanged photos
          are never re-hashed or re-uploaded. Items in the Locked Folder and the Safe Folder never enter the
          backup.
        </ThemedText>
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
  card: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardText: { flex: 1, gap: 2 },
  cardColumn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usageBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  usageFill: { borderRadius: 4 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  error: { lineHeight: 18 },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
