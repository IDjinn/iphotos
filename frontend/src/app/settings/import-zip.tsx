import { Pressable, ScrollView, View } from 'react-native';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Card,
  CardColumn,
  CardText,
  ErrorText,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Note,
  PrimaryButton,
  PrimaryButtonText,
  ReportRow,
  RuleRow,
  RuleText,
  Screen,
  SecondaryButton,
  SecondaryButtonText,
  UsageBar,
  UsageFill,
} from '@/app/settings/import-zip.styles';
import { pickZipFile } from '@/data/import-repository';
import { useAccountStore } from '@/stores/account';
import { useImportZipStore } from '@/stores/import-zip';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

const RULES: { icon: IconName; text: string }[] = [
  { icon: 'image-outline', text: 'Photos import as jpg, png, webp or heic (converted to jpeg).' },
  { icon: 'videocam-outline', text: 'Videos import as mp4, mov, webm, avi or 3gp.' },
  { icon: 'copy-outline', text: 'Duplicates are recognized and skipped automatically.' },
  { icon: 'layers-outline', text: 'Multi-part export? Import each zip — duplicates are handled.' },
];

/** Remaining (unfilled) portion of a progress bar. */
function UsageRemainder({ fraction }: { fraction: number }) {
  return <View style={{ flex: Math.max(fraction, 0.001) }} />;
}

export default function ImportZipScreen() {
  const { colors, space } = useTheme();
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
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">Import from ZIP</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Body>
        {mode !== 'cloud' ? (
          <>
            <EmptyState
              icon="cloud-offline"
              title="Cloud import unavailable"
              subtitle="Sign in and switch to Cloud mode to import photo archives into your cloud library."
            />
            <AccountCard
              onPress={() => {
                haptic('light');
                router.push('/settings/account');
              }}
              accessibilityLabel="Go to account settings"
            >
              <Icon name="person-circle-outline" size={22} color={colors.accent} />
              <CardText>
                <ThemedText variant="body">Review your account</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  Sign in or switch the sync mode
                </ThemedText>
              </CardText>
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            </AccountCard>
          </>
        ) : phase === 'idle' ? (
          <>
            <CardColumn>
              <RuleRow>
                <Icon name="archive-outline" size={22} color={colors.accent} />
                <ThemedText variant="body">Photo archive</ThemedText>
              </RuleRow>
              <ThemedText variant="bodySmall" color="secondary">
                Import a zip with photos and videos — Google Takeout exports work as-is.
                Everything lands directly in your cloud library.
              </ThemedText>
              {RULES.map((rule) => (
                <RuleRow key={rule.text}>
                  <Icon name={rule.icon} size={18} color={colors.textSecondary} />
                  <RuleText variant="bodySmall" color="secondary">
                    {rule.text}
                  </RuleText>
                </RuleRow>
              ))}
            </CardColumn>

            {detached && job ? (
              <CardColumn>
                <ThemedText variant="bodySmall" color="secondary">
                  The previous import keeps running in the background — it will appear in your
                  cloud photos when finished.
                </ThemedText>
              </CardColumn>
            ) : null}

            {error ? (
              <ErrorText variant="bodySmall" color="danger">
                {error}
              </ErrorText>
            ) : null}

            {pickError ? (
              <ErrorText variant="bodySmall" color="danger">
                {pickError}
              </ErrorText>
            ) : null}

            <PrimaryButton
              onPress={chooseZip}
              accessibilityRole="button"
              accessibilityLabel="Choose a zip file to import"
            >
              <Icon name="folder-open-outline" size={20} color={colors.background} />
              <PrimaryButtonText variant="body" color="inverse">
                Choose ZIP file
              </PrimaryButtonText>
            </PrimaryButton>
          </>
        ) : busy ? (
          <>
            <CardColumn>
              <RuleRow>
                {phase === 'processing' ? (
                  <Icon name="sync" size={22} color={colors.accent} />
                ) : (
                  <Icon name="cloud-upload-outline" size={22} color={colors.accent} />
                )}
                <ThemedText variant="body">
                  {phase === 'uploading'
                    ? 'Uploading archive…'
                    : job && job.totalEntries > 0
                      ? 'Importing media…'
                      : 'Preparing import…'}
                </ThemedText>
              </RuleRow>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                {fileName}
                {job && job.state !== 'Done' && job.processedEntries > 0
                  ? ` · ${job.processedEntries}${job.totalEntries > 0 ? ` of ${job.totalEntries}` : ''}`
                  : ''}
              </ThemedText>

              {phase === 'uploading' && uploadProgress !== null ? (
                <>
                  <UsageBar>
                    <UsageFill $fraction={uploadProgress} />
                    <UsageRemainder fraction={1 - Math.min(1, uploadProgress)} />
                  </UsageBar>
                  <ThemedText variant="bodySmall" color="secondary">
                    {Math.round(uploadProgress * 100)}%
                    {pickedSizeBytes ? ` · ${formatBytes(pickedSizeBytes)}` : ''}
                  </ThemedText>
                </>
              ) : null}

              {phase === 'processing' ? (
                <>
                  {processingFraction !== null ? (
                    <UsageBar>
                      <UsageFill $fraction={processingFraction} />
                      <UsageRemainder fraction={1 - Math.min(1, processingFraction)} />
                    </UsageBar>
                  ) : null}
                  {job && job.imported + job.duplicated > 0 ? (
                    <ThemedText variant="bodySmall" color="secondary">
                      {job.imported} imported · {job.duplicated} duplicates so far
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </CardColumn>

            <SecondaryButton
              onPress={() => {
                haptic('medium');
                void cancel();
              }}
              accessibilityRole="button"
              accessibilityLabel={phase === 'uploading' ? 'Cancel upload' : 'Stop following the import'}
            >
              <SecondaryButtonText variant="body">
                {phase === 'uploading' ? 'Cancel upload' : 'Stop following'}
              </SecondaryButtonText>
            </SecondaryButton>

            {phase === 'processing' ? (
              <Note variant="bodySmall" color="secondary">
                You can leave this screen — the import keeps going and duplicates are always
                skipped, so re-importing the same zip is safe.
              </Note>
            ) : null}
          </>
        ) : null}

        {phase === 'done' && job ? (
          <>
            <CardColumn>
              <RuleRow>
                <Icon
                  name={job.state === 'Failed' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={22}
                  color={job.state === 'Failed' ? colors.danger : colors.accent}
                />
                <ThemedText variant="body">
                  {job.state === 'Failed' ? 'Import failed' : 'Import finished'}
                </ThemedText>
              </RuleRow>
              {REPORT_ROWS.map((row) => (
                <ReportRow key={row.label}>
                  <ThemedText variant="bodySmall" color="secondary">
                    {row.label}
                  </ThemedText>
                  <ThemedText variant="bodySmall">{job[row.key].toLocaleString('en-US')}</ThemedText>
                </ReportRow>
              ))}
              {job.error ? (
                <ErrorText variant="bodySmall" color="danger">
                  {job.error}
                </ErrorText>
              ) : null}
            </CardColumn>

            <PrimaryButton
              onPress={chooseZip}
              accessibilityRole="button"
              accessibilityLabel="Import another zip"
            >
              <PrimaryButtonText variant="body" color="inverse">
                Import another ZIP
              </PrimaryButtonText>
            </PrimaryButton>
            <SecondaryButton onPress={finish} accessibilityRole="button" accessibilityLabel="Done">
              <SecondaryButtonText variant="body">Done</SecondaryButtonText>
            </SecondaryButton>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <CardColumn>
              <ErrorText variant="bodySmall" color="danger">
                {error ?? 'Import failed — try again.'}
              </ErrorText>
            </CardColumn>
            <PrimaryButton onPress={reset} accessibilityRole="button" accessibilityLabel="Try again">
              <PrimaryButtonText variant="body" color="inverse">
                Try again
              </PrimaryButtonText>
            </PrimaryButton>
          </>
        ) : null}
      </Body>
    </Screen>
  );
}

/** Pressable account row card with pressed feedback. */
function AccountCard({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Card
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Card>
  );
}

const REPORT_ROWS: {
  label: string;
  key: 'imported' | 'videosImported' | 'duplicated' | 'ignored' | 'failed';
}[] = [
  { label: 'Imported', key: 'imported' },
  { label: 'Videos imported', key: 'videosImported' },
  { label: 'Duplicates skipped', key: 'duplicated' },
  { label: 'Files skipped', key: 'ignored' },
  { label: 'Failed', key: 'failed' },
];
