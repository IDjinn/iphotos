import { useMemo, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  ActionButton,
  ActionButtonText,
  Badge,
  BadgeText,
  ErrorText,
  FirstSection,
  Footnote,
  Header,
  HeaderSpacer,
  HeaderTitle,
  NameLine,
  OptionRow,
  ProgressBlock,
  ProgressLine,
  RowLabel,
  RowText,
  RuntimeCard,
  Screen,
  Section,
  SectionTitle,
  TextButton,
  TextButtonRow,
  Track,
  TrackFill,
} from '@/app/settings/ai-model.styles';
import {
  MODEL_CATALOG,
  formatRam,
  getHardwareCapability,
  modelEligibility,
  recommendModel,
  type ModelDescriptor,
} from '@/data/model-registry';
import { VISION_MODEL_SIZE_LABEL } from '@/data/ml/model-files';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n/hook';
import { useAiModelStore } from '@/stores/ai-model';
import { useLocalMlStore } from '@/stores/local-ml';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section>
      <SectionTitle variant="label">{title}</SectionTitle>
      {children}
    </Section>
  );
}

function capabilityLabel(
  cap: ReturnType<typeof getHardwareCapability>,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  const parts: string[] = [];
  if (cap.totalRamBytes) parts.push(formatRam(cap.totalRamBytes));
  if (cap.cpuArch) parts.push(cap.cpuArch);
  parts.push(cap.isPhysicalDevice ? t('aiModel.device') : t('aiModel.emulator'));
  return parts.join(' · ');
}

function capabilityLine(
  model: ModelDescriptor,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  const parts: string[] = [];
  if (model.sizeLabel) parts.push(model.sizeLabel);
  if (model.minRamBytes) parts.push(t('aiModel.needsRam', { ram: formatRam(model.minRamBytes) }));
  parts.push(model.capabilities.semanticSearch ? t('aiModel.semanticSearch') : t('aiModel.labelsOnly'));
  return parts.join(' · ');
}

/** Selectable model row with pressed/disabled feedback and a trailing check. */
function SelectRow({
  active,
  disabled,
  onPress,
  accessibilityLabel,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <OptionRow
      $pressed={pressed}
      $disabled={disabled}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      <Icon
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={active ? colors.accent : colors.textDisabled}
      />
    </OptionRow>
  );
}

/** Pressable accent action with pressed/disabled states. */
function ActionRow({
  onPress,
  disabled,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <ActionButton
      $pressed={pressed}
      $disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      disabled={disabled}
    >
      <ActionButtonText variant="body">{label}</ActionButtonText>
    </ActionButton>
  );
}

/**
 * The runtime card: downloads and runs the actual on-device model (CLIP
 * ViT-B/32 int8 via ONNX Runtime). Independent of the preference picker
 * above — v1 runs CLIP on any device that downloads it, slower on low-RAM
 * hardware.
 */
function RuntimeCardSection() {
  const { colors } = useTheme();
  const { t, localeTag } = useTranslation();
  const ready = useLocalMlStore((s) => s.modelReady);
  const downloading = useLocalMlStore((s) => s.downloading);
  const downloadProgress = useLocalMlStore((s) => s.downloadProgress);
  const downloadError = useLocalMlStore((s) => s.downloadError);
  const running = useLocalMlStore((s) => s.running);
  const progress = useLocalMlStore((s) => s.progress);
  const lastError = useLocalMlStore((s) => s.lastError);
  const downloadModel = useLocalMlStore((s) => s.downloadModel);
  const deleteModel = useLocalMlStore((s) => s.deleteModel);
  const runLabeling = useLocalMlStore((s) => s.runLabeling);

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.floor((progress.scanned / progress.total) * 100))
      : 0;
  const error = downloadError ?? lastError;

  const confirmRedo = () => {
    haptic('light');
    Alert.alert(t('aiModel.redoTitle'), t('aiModel.redoBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('aiModel.redo'), style: 'destructive', onPress: () => void runLabeling(true) },
    ]);
  };

  const confirmDelete = () => {
    haptic('light');
    Alert.alert(t('aiModel.deleteTitle'), t('aiModel.deleteBody', { size: VISION_MODEL_SIZE_LABEL }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: deleteModel },
    ]);
  };

  return (
    <RuntimeCard>
      <OptionRow $pressed={false}>
        <Icon name={ready ? 'checkmark-circle' : 'cloud-download-outline'} size={22} color={ready ? colors.accent : colors.icon} />
        <RowText>
          <RowLabel variant="body">{t('aiModel.runtimeTitle')}</RowLabel>
          <ThemedText variant="bodySmall" color="secondary">
            {ready
              ? t('aiModel.downloaded')
              : t('aiModel.notDownloaded', { size: VISION_MODEL_SIZE_LABEL })}
          </ThemedText>
          {downloading ? (
            <ProgressBlock>
              <ProgressLine>
                <ActivityIndicator size="small" color={colors.accent} />
                <ThemedText variant="bodySmall" color="secondary">
                  {downloadProgress !== null
                    ? t('aiModel.downloadingPct', { percent: Math.floor(downloadProgress * 100) })
                    : t('aiModel.downloading')}
                </ThemedText>
              </ProgressLine>
              <Track>
                <TrackFill $pct={(downloadProgress ?? 0) * 100} />
              </Track>
            </ProgressBlock>
          ) : null}
          {running ? (
            <ProgressBlock>
              <ProgressLine>
                <ActivityIndicator size="small" color={colors.accent} />
                <ThemedText variant="bodySmall" color="secondary">
                  {progress && progress.total > 0
                    ? t('settings.ai.labeling', {
                        percent: pct,
                        count: progress.scanned.toLocaleString(localeTag),
                        total: progress.total.toLocaleString(localeTag),
                      })
                    : t('aiModel.labeling')}
                </ThemedText>
              </ProgressLine>
              <Track>
                <TrackFill $pct={pct} />
              </Track>
            </ProgressBlock>
          ) : null}
          {error ? (
            <ErrorText variant="bodySmall" color="danger">
              {error}
            </ErrorText>
          ) : null}
        </RowText>
      </OptionRow>

      {!ready && !downloading ? (
        <ActionRow onPress={() => void downloadModel()} label={t('aiModel.download')} />
      ) : null}
      {ready && !downloading ? (
        <ActionRow disabled={running} onPress={() => void runLabeling()} label={running ? t('aiModel.labeling') : t('aiModel.labelNow')} />
      ) : null}
      {ready && !running && !downloading ? (
        <TextButtonRow>
          <TextButton onPress={confirmRedo}>
            <ThemedText variant="bodySmall" color="secondary">
              {t('aiModel.redoLabels')}
            </ThemedText>
          </TextButton>
          <TextButton onPress={confirmDelete}>
            <ThemedText variant="bodySmall" color="danger">
              {t('aiModel.deleteModel')}
            </ThemedText>
          </TextButton>
        </TextButtonRow>
      ) : null}
    </RuntimeCard>
  );
}

/**
 * Picks the classification model used for smart search and labels.
 * Local models run on this device (recommended when the hardware allows);
 * cloud models arrive with the cloud service and stay listed but locked.
 */
export default function AiModelScreen() {
  const { colors, space } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const selectedModelId = useAiModelStore((s) => s.selectedModelId);
  const setModel = useAiModelStore((s) => s.setModel);

  const cap = useMemo(() => getHardwareCapability(), []);
  const recommended = useMemo(() => recommendModel(cap), [cap]);
  const localModels = useMemo(() => MODEL_CATALOG.filter((m) => m.kind === 'local'), []);
  const cloudModels = useMemo(() => MODEL_CATALOG.filter((m) => m.kind === 'cloud'), []);

  const activeId = selectedModelId ?? recommended?.id ?? null;
  const select = (id: string | null) => {
    haptic('light');
    setModel(id);
  };

  const renderModelRow = (model: ModelDescriptor) => {
    const eligibility = modelEligibility(model, cap);
    const active = activeId === model.id;
    const recommendedBadge = recommended?.id === model.id;
    return (
      <SelectRow
        key={model.id}
        active={active}
        disabled={!eligibility.ok}
        onPress={() => select(model.id)}
        accessibilityLabel={model.name}
      >
        <RowText>
          <NameLine>
            <RowLabel variant="body">{model.name}</RowLabel>
            {recommendedBadge ? (
              <Badge>
                <BadgeText variant="bodySmall" color="accent">
                  {t('aiModel.recommended')}
                </BadgeText>
              </Badge>
            ) : null}
          </NameLine>
          <ThemedText variant="bodySmall" color="secondary">
            {eligibility.ok ? capabilityLine(model, t) : eligibility.reason}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary">
            {model.description}
          </ThemedText>
        </RowText>
      </SelectRow>
    );
  };

  return (
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
      showsVerticalScrollIndicator={false}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('settings.ai.modelTitle')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Animated.View entering={FadeInDown.duration(200)}>
        <FirstSection>
          <OptionRow $pressed={false}>
            <Icon name="hardware-chip-outline" size={22} color={colors.icon} />
            <RowText>
              <RowLabel variant="body">{t('aiModel.thisDevice')}</RowLabel>
              <ThemedText variant="bodySmall" color="secondary">
                {capabilityLabel(cap, t)}
              </ThemedText>
            </RowText>
          </OptionRow>
        </FirstSection>

        <SectionBlock title={t('aiModel.sectionOnDevice')}>
          <RuntimeCardSection />
        </SectionBlock>

        {recommended ? (
          <SectionBlock title={t('aiModel.sectionLocal')}>
            <SelectRow
              active={selectedModelId === null}
              onPress={() => select(null)}
              accessibilityLabel={t('aiModel.automatic')}
            >
              <RowText>
                <NameLine>
                  <RowLabel variant="body">{t('aiModel.automatic')}</RowLabel>
                </NameLine>
                <ThemedText variant="bodySmall" color="secondary">
                  {t('aiModel.automaticHint', { model: recommended.name })}
                </ThemedText>
              </RowText>
            </SelectRow>
            {localModels.map(renderModelRow)}
          </SectionBlock>
        ) : (
          <SectionBlock title={t('aiModel.sectionLocal')}>
            <OptionRow $pressed={false}>
              <Icon name="cloud-offline-outline" size={22} color={colors.iconInactive} />
              <RowText>
                <RowLabel variant="body">{t('aiModel.localUnavailable')}</RowLabel>
                <ThemedText variant="bodySmall" color="secondary">
                  {t('aiModel.localUnavailableBody')}
                </ThemedText>
              </RowText>
            </OptionRow>
          </SectionBlock>
        )}

        <SectionBlock title={t('aiModel.sectionCloud')}>{cloudModels.map(renderModelRow)}</SectionBlock>

        <Footnote variant="bodySmall" color="secondary">
          {t('aiModel.footnote')}
        </Footnote>
      </Animated.View>
    </Screen>
  );
}
