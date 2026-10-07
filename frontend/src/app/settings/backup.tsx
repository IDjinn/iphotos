import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  BreakdownRow,
  Card,
  CardColumn,
  CardRow,
  CardText,
  ErrorText,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Note,
  Screen,
  UsageBar,
  UsageFill,
  UsageHeader,
  UsageRemainder,
} from '@/app/settings/backup.styles';
import { getUsage, type CloudUsage } from '@/data/cloud-photos-repository';
import { isExpoGo } from '@/data/native-crypto';
import type { BackupProgress } from '@/data/backup-engine';
import { getHeldFolderViews, type BackupFolderView } from '@/data/backup-folders';
import { useAccountStore } from '@/stores/account';
import { useBackupStore } from '@/stores/backup';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

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
  const { colors, space } = useTheme();
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
  const [heldFolders, setHeldFolders] = useState<BackupFolderView[]>([]);

  useEffect(() => {
    if (cloudOnly) return;
    refreshStats();
    const unsubscribe = useBackupStore.subscribe((state, prev) => {
      if ((!state.scanning && prev.scanning) || (!state.running && prev.running)) state.refreshStats();
    });
    return unsubscribe;
  }, [refreshStats, cloudOnly]);

  // Refresh cloud usage on focus (Expo Go view), so a finished ZIP import
  // shows up at once; native builds refresh the held-folder badge instead.
  useFocusEffect(
    useCallback(() => {
      if (cloudOnly) {
        void getUsage().then(setUsage).catch(() => setUsage(null));
        return;
      }
      void getHeldFolderViews()
        .then(setHeldFolders)
        .catch(() => setHeldFolders([]));
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
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">Backup</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Body>
        {cloudOnly ? (
          <>
            <CardColumn>
              <UsageHeader>
                <ThemedText variant="body">Cloud storage</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {usage ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}` : ' '}
                </ThemedText>
              </UsageHeader>
              {usage && usage.quotaBytes > 0 ? (
                <UsageBar>
                  <UsageFill $fraction={Math.max(0.02, Math.min(1, usage.usedBytes / usage.quotaBytes))} />
                  <UsageRemainder $fraction={1 - Math.min(1, usage.usedBytes / usage.quotaBytes)} />
                </UsageBar>
              ) : null}
              <ThemedText variant="bodySmall" color="secondary">
                {usage
                  ? `${formatCount(usage.photoCount)} photo${usage.photoCount === 1 ? '' : 's'} stored in your account`
                  : 'Could not reach the backend — sign in and try again.'}
              </ThemedText>
            </CardColumn>

            <ActionCard
              onPress={() => {
                haptic('light');
                router.push('/settings/import-zip');
              }}
              accessibilityLabel="Add photos via ZIP import"
            >
              <CardRow>
                <Icon name="archive-outline" size={22} color={colors.accent} />
                <CardText>
                  <ThemedText variant="body">Add photos via ZIP import</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    Upload a ZIP (Google Takeout style) — processed on the server
                  </ThemedText>
                </CardText>
                <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
              </CardRow>
            </ActionCard>

            <Note variant="bodySmall" color="secondary">
              Scanning and uploading this phone&apos;s gallery needs the native build — the Expo Go preview client
              cannot access the device media library. Photos you import via ZIP appear in the cloud and on the
              Photos tab normally.
            </Note>
          </>
        ) : (
          <>
            <CardColumn>
              {stats && stats.totalItems > 0 ? (
                <>
                  <UsageHeader>
                    <ThemedText variant="body">Local inventory</ThemedText>
                    <ThemedText variant="bodySmall" color="secondary">
                      {formatBytes(stats.totalBytes)}
                    </ThemedText>
                  </UsageHeader>
                  <ThemedText variant="bodySmall" color="secondary">
                    {formatCount(stats.totalItems)} photos tracked on this device · {formatBytes(stats.uploadedBytes)}{' '}
                    backed up
                  </ThemedText>
                  {breakdown
                    .filter((row) => row.count > 0)
                    .map((row) => (
                      <BreakdownRow key={row.label}>
                        <ThemedText variant="bodySmall" color="secondary">
                          {row.label}
                        </ThemedText>
                        <ThemedText variant="bodySmall">
                          {formatCount(row.count)}
                          {row.bytes !== null && row.bytes > 0 ? ` · ${formatBytes(row.bytes)}` : ''}
                        </ThemedText>
                      </BreakdownRow>
                    ))}
                </>
              ) : (
                <ThemedText variant="bodySmall" color="secondary">
                  {backup.scanning ? 'Building your inventory…' : 'No inventory yet — run a scan to index your photos.'}
                </ThemedText>
              )}
            </CardColumn>

            {backup.lastError ? (
              <ErrorText variant="bodySmall" color="danger">
                {backup.lastError}
              </ErrorText>
            ) : null}

            {heldFolders.length > 0 ? (
              <ActionCard accent onPress={() => router.push('/settings/backup/folders')} accessibilityLabel="Review new folders">
                <CardRow>
                  <Icon name="alert-circle-outline" size={22} color={colors.accent} />
                  <CardText>
                    <ThemedText variant="body" color="accent">
                      {heldFolders.length} new folder{heldFolders.length === 1 ? '' : 's'} detected
                    </ThemedText>
                    <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                      {heldFolders[0].title}
                      {heldFolders.length > 1 ? ` and ${heldFolders.length - 1} more` : ''} — choose whether to back them up
                    </ThemedText>
                  </CardText>
                  <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
                </CardRow>
              </ActionCard>
            ) : null}

            <ActionCard onPress={() => router.push('/settings/backup/folders')} accessibilityLabel="Backup folders">
              <CardRow>
                <Icon name="folder-open-outline" size={22} color={colors.icon} />
                <CardText>
                  <ThemedText variant="body">Backup folders</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    Choose which folders enter the backup
                  </ThemedText>
                </CardText>
                <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
              </CardRow>
            </ActionCard>

            {backup.quotaExceeded ? (
              <ActionCard accent onPress={() => router.push('/settings/subscription')} accessibilityLabel="Upgrade storage">
                <CardRow>
                  <Icon name="cloud-circle-outline" size={22} color={colors.accent} />
                  <CardText>
                    <ThemedText variant="body" color="accent">
                      Upgrade storage
                    </ThemedText>
                    <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                      See cloud plans and keep backing up
                    </ThemedText>
                  </CardText>
                  <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
                </CardRow>
              </ActionCard>
            ) : null}
            {backup.scanError ? (
              <ErrorText variant="bodySmall" color="danger">
                {backup.scanError}
              </ErrorText>
            ) : null}

            <ActionCard
              disabled={busy}
              onPress={() => {
                if (!busy) void startScan();
              }}
              accessibilityLabel="Scan your library"
            >
              <CardRow>
                <Icon name="refresh-outline" size={22} color={colors.icon} />
                <CardText>
                  <ThemedText variant="body">Scan now</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    {scanCaption ?? 'Index your photos and find what changed — works offline'}
                  </ThemedText>
                </CardText>
                {backup.scanning ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
                )}
              </CardRow>
              {scanBar !== null ? (
                <UsageBar>
                  <UsageFill $fraction={Math.max(0.02, scanBar)} />
                  <UsageRemainder $fraction={1 - scanBar} />
                </UsageBar>
              ) : null}
            </ActionCard>

            <ActionCard
              dimmed={mode !== 'cloud' || busy}
              disabled={busy || mode !== 'cloud'}
              hapticKind="medium"
              onPress={() => {
                if (!busy) void startBackup();
              }}
              accessibilityLabel="Back up photos"
            >
              <CardRow>
                <Icon
                  name="cloud-upload-outline"
                  size={22}
                  color={mode === 'cloud' ? colors.accent : colors.iconInactive}
                />
                <CardText>
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
                </CardText>
                {backup.running ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
                )}
              </CardRow>
              {backupBar !== null ? (
                <UsageBar>
                  <UsageFill $fraction={Math.max(0.02, backupBar)} />
                  <UsageRemainder $fraction={1 - backupBar} />
                </UsageBar>
              ) : null}
            </ActionCard>

            <Note variant="bodySmall" color="secondary">
              The inventory tracks the size, modification time and content hash of each photo, so unchanged photos
              are never re-hashed or re-uploaded. Items in the Locked Folder and the Safe Folder never enter the
              backup.
            </Note>
          </>
        )}
      </Body>
    </Screen>
  );
}

/** Pressable settings card with pressed feedback (parity with the opacity dip). */
function ActionCard({
  onPress,
  accent,
  dimmed,
  disabled,
  hapticKind = 'light',
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accent?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  hapticKind?: 'light' | 'medium';
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Card
      $pressed={pressed}
      $accent={accent}
      $dimmed={dimmed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic(hapticKind);
        onPress();
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Card>
  );
}
