import { useCallback, useEffect, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Alert, Pressable, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  BackupBarFill,
  BackupBarTrack,
  CacheInput,
  Header,
  HeaderSpacer,
  HeaderTitle,
  License,
  Row,
  RowLabel,
  RowText,
  Screen,
  Section,
  SectionHint,
  SectionTitle,
  StaticRow,
  ThemeOption,
  ThemeRow,
} from '@/screens/settings.styles';
import type { CloudCacheMode } from '@/data/cloud-media-cache';
import { cloudCacheModeChanged } from '@/data/cloud-media-cache';
import { countLabeledAssets } from '@/data/labels-repository';
import type { UploadQuality } from '@/data/user-preferences';
import { getUserPreferences, updateUserPreferences } from '@/data/user-preferences';
import { getPendingFolderDecisions } from '@/data/sync-rules-repository';
import type { LanguageMode, LocaleTag, TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n/hook';
import { useAiLabelingStore } from '@/stores/ai-labeling';
import { useAccountStore } from '@/stores/account';
import { useBackupStore } from '@/stores/backup';
import { useClassificationStore } from '@/stores/classification';
import { useEncryptedModeStore } from '@/stores/encrypted-mode';
import { useSettingsStore } from '@/stores/settings';
import { useThumbnailsStore } from '@/stores/thumbnails';
import type { ThemeMode } from '@/theme/context';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section>
      <SectionTitle variant="label">{title}</SectionTitle>
      {children}
    </Section>
  );
}

/** Navigable settings row with press feedback (parity with the original opacity dip). */
function NavRow({
  onPress,
  disabled,
  spaced,
  dimmed,
  accessibilityLabel,
  accessibilityRole,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  spaced?: boolean;
  dimmed?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Row
      $pressed={pressed}
      $dimmed={dimmed}
      $spaced={spaced}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Row>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; labelKey: TranslationKey; icon: IconName }[] = [
  { mode: 'system', labelKey: 'settings.appearance.system', icon: 'phone-portrait-outline' },
  { mode: 'light', labelKey: 'settings.appearance.light', icon: 'sunny-outline' },
  { mode: 'dark', labelKey: 'settings.appearance.dark', icon: 'moon-outline' },
];

const LANGUAGE_OPTIONS: { mode: LanguageMode; labelKey: TranslationKey; icon: IconName }[] = [
  { mode: 'system', labelKey: 'settings.language.system', icon: 'phone-portrait-outline' },
  { mode: 'en', labelKey: 'settings.language.english', icon: 'language-outline' },
  { mode: 'pt', labelKey: 'settings.language.portuguese', icon: 'language-outline' },
];

const CLOUD_CACHE_OPTIONS: { mode: CloudCacheMode; labelKey: TranslationKey; icon: IconName }[] = [
  { mode: 'default', labelKey: 'settings.cloudCache.default', icon: 'albums-outline' },
  { mode: 'limited', labelKey: 'settings.cloudCache.limited', icon: 'server-outline' },
  { mode: 'all', labelKey: 'settings.cloudCache.everything', icon: 'cloud-done-outline' },
];

const UPLOAD_QUALITY_OPTIONS: { mode: UploadQuality; labelKey: TranslationKey; icon: IconName }[] = [
  { mode: 'original', labelKey: 'settings.uploadQuality.original', icon: 'diamond-outline' },
  { mode: 'storageSaver', labelKey: 'settings.uploadQuality.storageSaver', icon: 'save-outline' },
];

function renewDateLabel(epoch: number | undefined, localeTag: LocaleTag): string {
  if (!epoch) return '—';
  return new Date(epoch).toLocaleDateString(localeTag, { month: 'short', day: 'numeric' });
}

/** Just the host of the configured endpoint (never the key or full path). */
function aiHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function SettingsScreen() {
  const { colors, space } = useTheme();
  const { t, tCount, localeTag } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const formatCount = useCallback(
    (count: number) => count.toLocaleString(localeTag),
    [localeTag]
  );
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const languageMode = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const cloudCacheMode = useSettingsStore((s) => s.cloudCacheMode);
  const setCloudCacheMode = useSettingsStore((s) => s.setCloudCacheMode);
  const cloudCacheLimitMb = useSettingsStore((s) => s.cloudCacheLimitMb);
  const setCloudCacheLimitMb = useSettingsStore((s) => s.setCloudCacheLimitMb);
  const [cacheLimitInput, setCacheLimitInput] = useState(() => String(cloudCacheLimitMb));

  const onCacheLimitChange = (text: string) => {
    setCacheLimitInput(text);
    const mb = parseInt(text, 10);
    if (Number.isFinite(mb) && mb > 0) setCloudCacheLimitMb(mb);
  };

  const uploadQuality = useSettingsStore((s) => s.uploadQuality);
  const setUploadQuality = useSettingsStore((s) => s.setUploadQuality);
  const [qualityCaps, setQualityCaps] = useState<{ imageCapBytes: number; videoCapBytes: number } | null>(null);

  // Folders still awaiting a backup decision (doc 04 §5) — badge on the row.
  const [heldFolderCount, setHeldFolderCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setHeldFolderCount(getPendingFolderDecisions().size);
    }, [])
  );

  const changeUploadQuality = (mode: UploadQuality) => {
    if (mode === uploadQuality) return;
    haptic('light');
    const previous = uploadQuality;
    setUploadQuality(mode);
    void (async () => {
      try {
        const saved = await updateUserPreferences(mode, false);
        setQualityCaps({ imageCapBytes: saved.imageCapBytes, videoCapBytes: saved.videoCapBytes });
        if (saved.mismatchedPhotoCount > 0) {
          const count = formatCount(saved.mismatchedPhotoCount);
          Alert.alert(
            t('settings.uploadQuality.updateExistingTitle'),
            tCount('settings.uploadQuality.updateExistingBody', saved.mismatchedPhotoCount, { count }),
            [
              { text: t('settings.uploadQuality.keepExisting'), style: 'cancel' },
              {
                text: t('settings.uploadQuality.updateAction', { count }),
                onPress: () => {
                  void updateUserPreferences(mode, true).catch(() => {});
                },
              },
            ]
          );
        }
      } catch {
        setUploadQuality(previous);
      }
    })();
  };

  const uploadQualityHint = qualityCaps
    ? uploadQuality === 'storageSaver'
      ? t('settings.uploadQuality.hintSaver', {
          imageLimit: formatBytes(qualityCaps.imageCapBytes),
          videoLimit: formatBytes(qualityCaps.videoCapBytes),
        })
      : t('settings.uploadQuality.hintOriginal', {
          imageLimit: formatBytes(qualityCaps.imageCapBytes),
          videoLimit: formatBytes(qualityCaps.videoCapBytes),
        })
    : t('settings.uploadQuality.hintGeneric');

  const account = useAccountStore();
  const plan = useAccountStore((s) => s.plan);
  const refreshPlan = useAccountStore((s) => s.refreshPlan);

  // The upload-quality choice lives on the account — sync the local cache.
  useEffect(() => {
    if (account.mode !== 'cloud') return;
    getUserPreferences()
      .then((prefs) => {
        setUploadQuality(prefs.uploadQuality);
        setQualityCaps({ imageCapBytes: prefs.imageCapBytes, videoCapBytes: prefs.videoCapBytes });
      })
      .catch(() => {});
    // account.mode/setUploadQuality are stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.mode]);

  const backup = useBackupStore();
  const thumbnails = useThumbnailsStore();
  const encryptedMode = useEncryptedModeStore();
  const aiEnabled = useClassificationStore((s) => s.aiEnabled);
  const setAiEnabled = useClassificationStore((s) => s.setAiEnabled);
  const localSearchEnabled = useClassificationStore((s) => s.localEnabled);
  const setLocalSearchEnabled = useClassificationStore((s) => s.setLocalEnabled);
  const indexationRunning = useClassificationStore((s) => s.running);
  const indexationProgress = useClassificationStore((s) => s.progress);
  const indexationError = useClassificationStore((s) => s.lastError);
  const aiRunning = useClassificationStore((s) => s.aiRunning);
  const aiProgress = useClassificationStore((s) => s.aiProgress);
  const aiEndpoint = useAiLabelingStore((s) => s.endpoint);
  const aiModel = useAiLabelingStore((s) => s.model);
  const [labeledCount, setLabeledCount] = useState(() => countLabeledAssets());

  // SQLite writes land outside React's knowledge — refresh when a run finishes.
  useEffect(() => {
    const unsubscribe = useClassificationStore.subscribe((state, prev) => {
      if (!state.running && prev.running) setLabeledCount(countLabeledAssets());
    });
    const unsubscribeBackup = useBackupStore.subscribe((state, prev) => {
      if ((!state.running && prev.running) || (!state.scanning && prev.scanning)) state.refreshStats();
    });
    useBackupStore.getState().refreshStats();
    if (account.mode === 'cloud') void refreshPlan();
    return () => {
      unsubscribe();
      unsubscribeBackup();
    };
  }, [account.mode, refreshPlan]);

  const searchCaption = !localSearchEnabled
    ? t('common.off')
    : indexationRunning
      ? indexationProgress && indexationProgress.total > 0
        ? t('settings.ai.indexing', {
            percent: Math.min(
              100,
              Math.floor((indexationProgress.scanned / indexationProgress.total) * 100)
            ),
            count: formatCount(indexationProgress.scanned),
            total: formatCount(indexationProgress.total),
          })
        : t('settings.ai.indexingLibrary')
      : labeledCount > 0
        ? tCount('settings.ai.labeledCount', labeledCount, { count: formatCount(labeledCount) })
        : t('settings.ai.labelsSubtitle');

  const backupProgress = backup.progress;
  const backupStats = backup.stats;
  const backupBusy = backup.running || backup.scanning;
  const backupBusyCaption = backup.scanning
    ? backup.scanProgress && backup.scanProgress.total > 0
      ? `${backup.scanProgress.phase === 'scanning' ? t('settings.backup.scanPhase') : t('settings.backup.hashPhase')}… ${formatCount(
          Math.min(backup.scanProgress.processed, backup.scanProgress.total)
        )} ${t('units.of')} ${formatCount(backup.scanProgress.total)}`
      : backup.scanProgress?.phase === 'hashing'
        ? t('settings.backup.hashingLibrary')
        : t('settings.backup.scanningLibrary')
    : backupProgress
      ? backupProgress.phase === 'inventory'
        ? t('settings.backup.scanningLibrary')
        : backupProgress.phase === 'hashing'
          ? `${t('settings.backup.hashing')} ${formatCount(backupProgress.processed)} ${t('units.of')} ${formatCount(backupProgress.total)}…`
          : backupProgress.total > 0
            ? `${t('settings.backup.backingUp')} ${formatCount(Math.min(backupProgress.processed, backupProgress.total))} ${t('units.of')} ${formatCount(
                backupProgress.total
              )}${backupProgress.failed > 0 ? ` · ${formatCount(backupProgress.failed)} ${t('settings.backup.failed')}` : ''}`
            : t('settings.backup.backingUpEllipsis')
      : t('settings.backup.starting');
  const backupCaption = backupBusy
    ? backupBusyCaption
    : backup.lastError
      ? backup.lastError
      : backupStats && backupStats.totalItems > 0
        ? `${tCount('units.items', backupStats.totalItems, { count: formatCount(backupStats.totalItems) })} · ${formatBytes(backupStats.totalBytes)} · ${formatBytes(
            backupStats.uploadedBytes
          )} ${t('settings.backup.backedUp')}`
        : backupProgress && backupProgress.total > 0
          ? `${t('settings.backup.lastRun')}: ${formatCount(backupProgress.uploaded)} ${t('settings.backup.uploaded')} · ${formatCount(backupProgress.skipped)} ${t('settings.backup.alreadySaved')}${
              backupProgress.failed > 0 ? ` · ${formatCount(backupProgress.failed)} ${t('settings.backup.failed')}` : ''
            }`
          : t('settings.backup.subtitle');

  return (
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
      showsVerticalScrollIndicator={false}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('settings.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Animated.View entering={FadeInDown.duration(200)}>
        <SectionBlock title={t('settings.sections.account')}>
          <NavRow
            onPress={() => {
              haptic('light');
              router.push(account.user ? '/settings/account' : '/login');
            }}
            accessibilityLabel={t('settings.account.a11y')}
          >
            <Icon name="person-circle-outline" size={22} color={colors.icon} />
            <RowText>
              <ThemedText variant="body">{account.user ? account.user.email : t('settings.account.localMode')}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {account.user ? t('settings.account.cloudManage') : t('settings.account.noAccount')}
              </ThemedText>
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
          <NavRow
            spaced
            dimmed={account.mode !== 'cloud'}
            onPress={() => {
              haptic('light');
              router.push('/settings/subscription');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('settings.account.subscriptionA11y')}
          >
            <Icon
              name="cloud-circle-outline"
              size={22}
              color={plan ? colors.accent : colors.icon}
            />
            <RowText>
              <RowLabel variant="body">{t('settings.account.iPhotosCloud')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {plan
                  ? `${plan.label} · ${t('settings.account.renews', { date: renewDateLabel(plan.renewsAt, localeTag) })}`
                  : account.mode === 'cloud'
                    ? t('settings.account.addStorage')
                    : t('settings.account.requiresCloud')}
              </ThemedText>
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
        </SectionBlock>

        <SectionBlock title={t('settings.sections.backupSync')}>
          <NavRow
            onPress={() => {
              haptic('light');
              router.push('/settings/backup');
            }}
            accessibilityLabel={t('settings.backup.a11y')}
          >
            <Icon
              name={account.mode === 'cloud' ? 'cloud-upload-outline' : 'cloud-offline-outline'}
              size={22}
              color={account.mode === 'cloud' ? colors.accent : colors.icon}
            />
            <RowText>
              <RowLabel variant="body">{t('settings.backup.title')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {backupCaption}
              </ThemedText>
              {backup.running && backupProgress && backupProgress.phase === 'uploading' && backupProgress.total > 0 ? (
                <BackupBarTrack>
                  <BackupBarFill
                    $flex={Math.max(
                      0.02,
                      (backupProgress.processed - backupProgress.failed) / Math.max(1, backupProgress.total)
                    )}
                  />
                </BackupBarTrack>
              ) : null}
            </RowText>
            {backupBusy ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            )}
          </NavRow>
          <NavRow
            spaced
            onPress={() => {
              haptic('light');
              router.push('/settings/backup/folders');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('settings.backupFolders.title')}
          >
            <Icon name="folder-open-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.backupFolders.title')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {heldFolderCount > 0
                  ? tCount('settings.backupFolders.newFolders', heldFolderCount)
                  : t('settings.backupFolders.subtitle')}
              </ThemedText>
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
          <NavRow
            spaced
            dimmed={account.mode !== 'cloud'}
            onPress={() => {
              haptic('light');
              router.push('/settings/import-zip');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('settings.importZip.title')}
          >
            <Icon
              name="archive-outline"
              size={22}
              color={account.mode === 'cloud' ? colors.accent : colors.iconInactive}
            />
            <RowText>
              <RowLabel variant="body">{t('settings.importZip.title')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {account.mode === 'cloud' ? t('settings.importZip.subtitle') : t('settings.account.requiresCloud')}
              </ThemedText>
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
        </SectionBlock>

        {account.mode === 'cloud' ? (
          <SectionBlock title={t('settings.sections.uploadQuality')}>
            <ThemeRow>
              {UPLOAD_QUALITY_OPTIONS.map((option) => {
                const active = uploadQuality === option.mode;
                const label = t(option.labelKey);
                return (
                  <ThemeOption
                    key={option.mode}
                    $active={active}
                    onPress={() => changeUploadQuality(option.mode)}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.uploadQuality.a11y', { label })}
                  >
                    <Icon name={option.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                    <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                      {label}
                    </ThemedText>
                  </ThemeOption>
                );
              })}
            </ThemeRow>
            <SectionHint variant="bodySmall" color="secondary">
              {uploadQualityHint}
            </SectionHint>
          </SectionBlock>
        ) : null}

        <SectionBlock title={t('settings.sections.cloudCache')}>
          <ThemeRow>
            {CLOUD_CACHE_OPTIONS.map((option) => {
              const active = cloudCacheMode === option.mode;
              return (
                <ThemeOption
                  key={option.mode}
                  $active={active}
                  onPress={() => {
                    haptic('light');
                    setCloudCacheMode(option.mode);
                    cloudCacheModeChanged();
                  }}
                >
                  <Icon name={option.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                  <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                    {t(option.labelKey)}
                  </ThemedText>
                </ThemeOption>
              );
            })}
          </ThemeRow>
          <SectionHint variant="bodySmall" color="secondary">
            {cloudCacheMode === 'default'
              ? t('settings.cloudCache.hintDefault')
              : cloudCacheMode === 'limited'
                ? t('settings.cloudCache.hintLimited')
                : t('settings.cloudCache.hintAll')}
          </SectionHint>
          {cloudCacheMode === 'limited' ? (
            <StaticRow $spaced>
              <Icon name="server-outline" size={22} color={colors.icon} />
              <RowLabel variant="body">{t('settings.cloudCache.limitLabel')}</RowLabel>
              <CacheInput
                value={cacheLimitInput}
                onChangeText={onCacheLimitChange}
                keyboardType="number-pad"
                accessibilityLabel={t('settings.cloudCache.limitA11y')}
              />
            </StaticRow>
          ) : null}
        </SectionBlock>

        <SectionBlock title={t('settings.sections.appearance')}>
          <ThemeRow>
            {THEME_OPTIONS.map((option) => {
              const active = themeMode === option.mode;
              return (
                <ThemeOption
                  key={option.mode}
                  $active={active}
                  onPress={() => {
                    haptic('light');
                    setThemeMode(option.mode);
                  }}
                >
                  <Icon name={option.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                  <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                    {t(option.labelKey)}
                  </ThemedText>
                </ThemeOption>
              );
            })}
          </ThemeRow>
          <NavRow
            spaced
            disabled={thumbnails.running}
            onPress={() => {
              haptic('medium');
              if (!thumbnails.running) void thumbnails.startBatch();
            }}
            accessibilityLabel={t('settings.previews.a11y')}
          >
            <Icon name="images-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.previews.title')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {thumbnails.lastError
                  ? thumbnails.lastError
                  : thumbnails.running
                    ? thumbnails.progress && thumbnails.progress.total > 0
                      ? t('settings.previews.generating', {
                          percent: Math.min(
                            100,
                            Math.floor(
                              ((thumbnails.progress.generated + thumbnails.progress.skipped) /
                                thumbnails.progress.total) *
                                100
                            )
                          ),
                        })
                      : t('settings.previews.scanning')
                    : t('settings.previews.subtitle')}
              </ThemedText>
            </RowText>
            {thumbnails.running ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            )}
          </NavRow>
        </SectionBlock>

        <SectionBlock title={t('settings.sections.language')}>
          <ThemeRow>
            {LANGUAGE_OPTIONS.map((option) => {
              const active = languageMode === option.mode;
              return (
                <ThemeOption
                  key={option.mode}
                  $active={active}
                  onPress={() => {
                    haptic('light');
                    setLanguage(option.mode);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(option.labelKey)}
                >
                  <Icon name={option.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                  <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                    {t(option.labelKey)}
                  </ThemedText>
                </ThemeOption>
              );
            })}
          </ThemeRow>
        </SectionBlock>

        <SectionBlock title={t('settings.sections.feedback')}>
          <StaticRow>
            <Icon name="radio-outline" size={22} color={colors.icon} />
            <RowLabel variant="body">{t('settings.feedback.haptics')}</RowLabel>
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => {
                haptic('medium');
                setHapticsEnabled(v);
              }}
              trackColor={{ true: colors.accent, false: colors.outline }}
            />
          </StaticRow>
        </SectionBlock>

        <SectionBlock title={t('settings.sections.privacy')}>
          <NavRow
            onPress={() => {
              haptic('light');
              router.push('/locked');
            }}
          >
            <Icon name="lock-closed-outline" size={22} color={colors.icon} />
            <RowLabel variant="body">{t('settings.privacy.lockedFolder')}</RowLabel>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
          <NavRow
            spaced
            onPress={() => {
              haptic('light');
              router.push('/settings/encrypted-mode');
            }}
            accessibilityLabel={t('settings.privacy.encryptedMode')}
          >
            <Icon name="lock-closed-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.privacy.encryptedMode')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {encryptedMode.enabled
                  ? encryptedMode.unlocked
                    ? t('settings.privacy.encryptedUnlocked')
                    : t('settings.privacy.encryptedLocked')
                  : t('settings.privacy.encryptedOff')}
              </ThemedText>
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
          <StaticRow $spaced>
            <Icon name="sparkles-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.privacy.ai')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {aiEnabled
                  ? t('settings.privacy.aiOn')
                  : t('settings.privacy.aiOff')}
              </ThemedText>
            </RowText>
            <Switch
              value={aiEnabled}
              onValueChange={(v) => {
                haptic('medium');
                setAiEnabled(v);
              }}
              trackColor={{ true: colors.accent, false: colors.outline }}
              accessibilityLabel={t('settings.privacy.ai')}
            />
          </StaticRow>
          {aiEnabled ? (
          <>
          <StaticRow $spaced>
            <Icon name="sparkles-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.privacy.smartSearch')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {searchCaption}
              </ThemedText>
              {localSearchEnabled && indexationError ? (
                <ThemedText variant="bodySmall" color="danger">
                  {indexationError}
                </ThemedText>
              ) : null}
            </RowText>
            <Switch
              value={localSearchEnabled}
              onValueChange={(v) => {
                haptic('medium');
                setLocalSearchEnabled(v);
              }}
              trackColor={{ true: colors.accent, false: colors.outline }}
              accessibilityLabel={t('settings.privacy.smartSearchA11y')}
            />
          </StaticRow>
          <NavRow
            spaced
            onPress={() => {
              haptic('light');
              router.push('/settings/ai-labeling');
            }}
            accessibilityLabel={t('settings.ai.labelingTitle')}
          >
            <Icon name="color-wand-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('settings.ai.labelingTitle')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {aiEndpoint && aiModel ? `${aiHost(aiEndpoint)} · ${aiModel}` : t('settings.ai.notConfigured')}
              </ThemedText>
              {aiRunning && aiProgress && aiProgress.total > 0 ? (
                <ThemedText variant="bodySmall" color="secondary">
                  {t('settings.ai.labeling', {
                    percent: Math.min(
                      100,
                      Math.floor((aiProgress.scanned / aiProgress.total) * 100)
                    ),
                    count: formatCount(aiProgress.scanned),
                    total: formatCount(aiProgress.total),
                  })}
                </ThemedText>
              ) : null}
            </RowText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </NavRow>
          </>
          ) : null}
        </SectionBlock>

        <SectionBlock title={t('settings.sections.about')}>
          <StaticRow>
            <Icon name="information-circle-outline" size={22} color={colors.icon} />
            <RowLabel variant="body">{t('settings.about.version')}</RowLabel>
            <ThemedText variant="bodySmall" color="secondary">
              {Constants.expoConfig?.version ?? '0.1.0'}
            </ThemedText>
          </StaticRow>
          <License variant="bodySmall" color="secondary">
            {t('settings.about.license')}
          </License>
        </SectionBlock>
      </Animated.View>
    </Screen>
  );
}
