import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { pickZipFile } from '@/data/import-repository';
import { useAccountStore } from '@/stores/account';
import { useImportZipStore } from '@/stores/import-zip';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

const RULES: { icon: IconName; text: string }[] = [
  { icon: 'image-outline', text: 'Photos import as jpg, png, webp or heic (converted to jpeg).' },
  { icon: 'videocam-off-outline', text: 'Videos and metadata files are skipped.' },
  { icon: 'copy-outline', text: 'Duplicates are recognized and skipped automatically.' },
  { icon: 'layers-outline', text: 'Multi-part export? Import each zip — duplicates are handled.' },
];

export default function ImportZipScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mode = useAccountStore((s) => s.mode);
  const {
    phase,
    uploadProgress,
    fileName,
    pickedSizeBytes,
    job,
    error,
    detached,
    start,
    cancel,
    reset,
  } = useImportZipStore();
  const [pickError, setPickError] = useState<string | null>(null);

  const busy = phase === 'uploading' || phase === 'processing';

  const chooseZip = () => {
    haptic('light');
    setPickError(null);
    void pickZipFile()
      .then((zip) => {
        if (zip) void start(zip);
      })
      .catch((e: unknown) => {
        setPickError(e instanceof Error ? e.message : 'Could not open the file picker.');
      });
  };

  const finish = () => {
    haptic('light');
    reset();
    router.back();
  };

  const processingFraction =
    job && job.totalEntries > 0 ? Math.min(1, job.processedEntries / job.totalEntries) : null;

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
          Import from ZIP
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {mode !== 'cloud' ? (
          <>
            <EmptyState
              icon="cloud-offline"
              title="Cloud import unavailable"
              subtitle="Sign in and switch to Cloud mode to import photo archives into your cloud library."
            />
            <Pressable
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface },
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => {
                haptic('light');
                router.push('/settings/account');
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to account settings"
            >
              <Icon name="person-circle-outline" size={22} color={colors.accent} />
              <View style={styles.cardText}>
                <ThemedText variant="body">Review your account</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  Sign in or switch the sync mode
                </ThemedText>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            </Pressable>
          </>
        ) : phase === 'idle' ? (
          <>
            <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
              <View style={styles.ruleRow}>
                <Icon name="archive-outline" size={22} color={colors.accent} />
                <ThemedText variant="body">Photo archive</ThemedText>
              </View>
              <ThemedText variant="bodySmall" color="secondary">
                Import a zip with photos — Google Takeout exports work as-is. Everything lands
                directly in your cloud library.
              </ThemedText>
              {RULES.map((rule) => (
                <View key={rule.text} style={styles.ruleRow}>
                  <Icon name={rule.icon} size={18} color={colors.textSecondary} />
                  <ThemedText variant="bodySmall" color="secondary" style={styles.ruleText}>
                    {rule.text}
                  </ThemedText>
                </View>
              ))}
            </View>

            {detached && job ? (
              <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
                <ThemedText variant="bodySmall" color="secondary">
                  The previous import keeps running in the background — it will appear in your
                  cloud photos when finished.
                </ThemedText>
              </View>
            ) : null}

            {error ? (
              <ThemedText variant="bodySmall" color="danger" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            {pickError ? (
              <ThemedText variant="bodySmall" color="danger" style={styles.error}>
                {pickError}
              </ThemedText>
            ) : null}

            <PressableScale
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={chooseZip}
              accessibilityRole="button"
              accessibilityLabel="Choose a zip file to import"
            >
              <Icon name="folder-open-outline" size={20} color={colors.background} />
              <ThemedText variant="body" color="inverse" style={styles.primaryButtonText}>
                Choose ZIP file
              </ThemedText>
            </PressableScale>
          </>
        ) : busy ? (
          <>
            <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
              <View style={styles.ruleRow}>
                {phase === 'processing' ? (
                  <Icon name="sync" size={22} color={colors.accent} />
                ) : (
                  <Icon name="cloud-upload-outline" size={22} color={colors.accent} />
                )}
                <ThemedText variant="body">
                  {phase === 'uploading'
                    ? 'Uploading archive…'
                    : job && job.totalEntries > 0
                      ? 'Importing photos…'
                      : 'Preparing import…'}
                </ThemedText>
              </View>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                {fileName}
                {job && job.state !== 'Done' && job.processedEntries > 0
                  ? ` · ${job.processedEntries}${job.totalEntries > 0 ? ` of ${job.totalEntries}` : ''}`
                  : ''}
              </ThemedText>

              {phase === 'uploading' && uploadProgress !== null ? (
                <>
                  <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
                    <View
                      style={[
                        styles.usageFill,
                        { backgroundColor: colors.accent, flex: Math.max(0.02, uploadProgress) },
                      ]}
                    />
                    <View style={{ flex: 1 - Math.min(1, uploadProgress) }} />
                  </View>
                  <ThemedText variant="bodySmall" color="secondary">
                    {Math.round(uploadProgress * 100)}%
                    {pickedSizeBytes ? ` · ${formatBytes(pickedSizeBytes)}` : ''}
                  </ThemedText>
                </>
              ) : null}

              {phase === 'processing' ? (
                <>
                  {processingFraction !== null ? (
                    <View style={[styles.usageBar, { backgroundColor: colors.outline }]}>
                      <View
                        style={[
                          styles.usageFill,
                          { backgroundColor: colors.accent, flex: Math.max(0.02, processingFraction) },
                        ]}
                      />
                      <View style={{ flex: 1 - Math.min(1, processingFraction) }} />
                    </View>
                  ) : null}
                  {job && job.imported + job.duplicated > 0 ? (
                    <ThemedText variant="bodySmall" color="secondary">
                      {job.imported} imported · {job.duplicated} duplicates so far
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </View>

            <PressableScale
              style={[styles.secondaryButton, { borderColor: colors.outline }]}
              onPress={() => {
                haptic('medium');
                void cancel();
              }}
              accessibilityRole="button"
              accessibilityLabel={phase === 'uploading' ? 'Cancel upload' : 'Stop following the import'}
            >
              <ThemedText variant="body" style={styles.secondaryButtonText}>
                {phase === 'uploading' ? 'Cancel upload' : 'Stop following'}
              </ThemedText>
            </PressableScale>

            {phase === 'processing' ? (
              <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
                You can leave this screen — the import keeps going and duplicates are always
                skipped, so re-importing the same zip is safe.
              </ThemedText>
            ) : null}
          </>
        ) : null}

        {phase === 'done' && job ? (
          <>
            <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
              <View style={styles.ruleRow}>
                <Icon
                  name={job.state === 'Failed' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={22}
                  color={job.state === 'Failed' ? colors.danger : colors.accent}
                />
                <ThemedText variant="body">
                  {job.state === 'Failed' ? 'Import failed' : 'Import finished'}
                </ThemedText>
              </View>
              {REPORT_ROWS.map((row) => (
                <View key={row.label} style={styles.reportRow}>
                  <ThemedText variant="bodySmall" color="secondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText variant="bodySmall">{job[row.key].toLocaleString('en-US')}</ThemedText>
                </View>
              ))}
              {job.error ? (
                <ThemedText variant="bodySmall" color="danger" style={styles.error}>
                  {job.error}
                </ThemedText>
              ) : null}
            </View>

            <PressableScale
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={chooseZip}
              accessibilityRole="button"
              accessibilityLabel="Import another zip"
            >
              <ThemedText variant="body" color="inverse" style={styles.primaryButtonText}>
                Import another ZIP
              </ThemedText>
            </PressableScale>
            <PressableScale
              style={[styles.secondaryButton, { borderColor: colors.outline }]}
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <ThemedText variant="body" style={styles.secondaryButtonText}>
                Done
              </ThemedText>
            </PressableScale>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <View style={[styles.cardColumn, { backgroundColor: colors.surface }]}>
              <ThemedText variant="bodySmall" color="danger" style={styles.error}>
                {error ?? 'Import failed — try again.'}
              </ThemedText>
            </View>
            <PressableScale
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={reset}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <ThemedText variant="body" color="inverse" style={styles.primaryButtonText}>
                Try again
              </ThemedText>
            </PressableScale>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const REPORT_ROWS: { label: string; key: 'imported' | 'duplicated' | 'ignored' | 'videosIgnored' | 'failed' }[] = [
  { label: 'Imported', key: 'imported' },
  { label: 'Duplicates skipped', key: 'duplicated' },
  { label: 'Files skipped', key: 'ignored' },
  { label: 'Videos skipped', key: 'videosIgnored' },
  { label: 'Failed', key: 'failed' },
];

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
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleText: { flex: 1, lineHeight: 18 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between' },
  usageBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  usageFill: { borderRadius: 4 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryButtonText: { fontWeight: '600' },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  secondaryButtonText: { fontWeight: '600' },
  error: { lineHeight: 18 },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
