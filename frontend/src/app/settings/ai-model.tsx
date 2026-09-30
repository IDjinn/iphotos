import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  MODEL_CATALOG,
  formatRam,
  getHardwareCapability,
  modelEligibility,
  recommendModel,
  type ModelDescriptor,
} from '@/data/model-registry';
import { VISION_MODEL_SIZE_LABEL } from '@/data/ml/model-files';
import { useAiModelStore } from '@/stores/ai-model';
import { useLocalMlStore } from '@/stores/local-ml';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText variant="label" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function capabilityLabel(cap: ReturnType<typeof getHardwareCapability>): string {
  const parts: string[] = [];
  if (cap.totalRamBytes) parts.push(formatRam(cap.totalRamBytes));
  if (cap.cpuArch) parts.push(cap.cpuArch);
  parts.push(cap.isPhysicalDevice ? 'Device' : 'Emulator');
  return parts.join(' · ');
}

function capabilityLine(model: ModelDescriptor): string {
  const parts: string[] = [];
  if (model.sizeLabel) parts.push(model.sizeLabel);
  if (model.minRamBytes) parts.push(`needs ${formatRam(model.minRamBytes)}`);
  parts.push(model.capabilities.semanticSearch ? 'semantic search' : 'labels only');
  return parts.join(' · ');
}

/**
 * The runtime card: downloads and runs the actual on-device model (CLIP
 * ViT-B/32 int8 via ONNX Runtime). Independent of the preference picker
 * above — v1 runs CLIP on any device that downloads it, slower on low-RAM
 * hardware.
 */
function RuntimeCard() {
  const { colors } = useTheme();
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
    Alert.alert(
      'Redo on-device labels?',
      'Existing on-device labels are deleted and every photo is reprocessed offline.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redo', style: 'destructive', onPress: () => void runLabeling(true) },
      ]
    );
  };

  const confirmDelete = () => {
    haptic('light');
    Alert.alert('Delete the downloaded model?', `Frees ${VISION_MODEL_SIZE_LABEL}. Labels stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteModel },
    ]);
  };

  return (
    <View style={styles.runtimeCard}>
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <Icon name={ready ? 'checkmark-circle' : 'cloud-download-outline'} size={22} color={ready ? colors.accent : colors.icon} />
        <View style={styles.rowText}>
          <ThemedText variant="body" style={styles.rowLabel}>
            CLIP ViT-B/32 (int8) — runs offline
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary">
            {ready
              ? 'Downloaded — ready to label photos on this device.'
              : `Not downloaded (${VISION_MODEL_SIZE_LABEL}, one-time).`}
          </ThemedText>
          {downloading ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLine}>
                <ActivityIndicator size="small" color={colors.accent} />
                <ThemedText variant="bodySmall" color="secondary">
                  {downloadProgress !== null
                    ? `Downloading… ${Math.floor(downloadProgress * 100)}%`
                    : 'Downloading…'}
                </ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: colors.outline }]}>
                <View
                  style={[styles.fill, { backgroundColor: colors.accent, width: `${(downloadProgress ?? 0) * 100}%` }]}
                />
              </View>
            </View>
          ) : null}
          {running ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLine}>
                <ActivityIndicator size="small" color={colors.accent} />
                <ThemedText variant="bodySmall" color="secondary">
                  {progress && progress.total > 0
                    ? `Labeling… ${pct}% (${progress.scanned.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')})`
                    : 'Labeling…'}
                </ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: colors.outline }]}>
                <View style={[styles.fill, { backgroundColor: colors.accent, width: `${pct}%` }]} />
              </View>
            </View>
          ) : null}
          {error ? (
            <ThemedText variant="bodySmall" color="danger" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {!ready && !downloading ? (
        <Pressable
          style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
          onPress={() => {
            haptic('light');
            void downloadModel();
          }}
        >
          <ThemedText variant="body" style={styles.actionButtonText}>
            Download model
          </ThemedText>
        </Pressable>
      ) : null}
      {ready && !downloading ? (
        <Pressable
          disabled={running}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.accent },
            running && styles.buttonDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            haptic('light');
            void runLabeling();
          }}
        >
          <ThemedText variant="body" style={styles.actionButtonText}>
            {running ? 'Labeling…' : 'Label photos now'}
          </ThemedText>
        </Pressable>
      ) : null}
      {ready && !running && !downloading ? (
        <View style={styles.textButtonRow}>
          <Pressable style={styles.textButton} onPress={confirmRedo}>
            <ThemedText variant="bodySmall" color="secondary">
              Redo labels
            </ThemedText>
          </Pressable>
          <Pressable style={styles.textButton} onPress={confirmDelete}>
            <ThemedText variant="bodySmall" color="danger">
              Delete model
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Picks the classification model used for smart search and labels.
 * Local models run on this device (recommended when the hardware allows);
 * cloud models arrive with the cloud service and stay listed but locked.
 */
export default function AiModelScreen() {
  const { colors } = useTheme();
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
      <Pressable
        key={model.id}
        disabled={!eligibility.ok}
        accessibilityLabel={model.name}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface },
          !eligibility.ok && styles.rowDisabled,
          pressed && { opacity: 0.75 },
        ]}
        onPress={() => select(model.id)}
      >
        <View style={styles.rowText}>
          <View style={styles.nameLine}>
            <ThemedText variant="body" style={styles.rowLabel}>
              {model.name}
            </ThemedText>
            {recommendedBadge ? (
              <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                <ThemedText variant="bodySmall" color="accent" style={styles.badgeText}>
                  Recommended
                </ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText variant="bodySmall" color="secondary">
            {eligibility.ok ? capabilityLine(model) : eligibility.reason}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary">
            {model.description}
          </ThemedText>
        </View>
        <Icon
          name={active ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={active ? colors.accent : colors.textDisabled}
        />
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          AI model
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <Animated.View entering={FadeInDown.duration(200)}>
        <View style={[styles.row, { backgroundColor: colors.surface }]}>
          <Icon name="hardware-chip-outline" size={22} color={colors.icon} />
          <View style={styles.rowText}>
            <ThemedText variant="body" style={styles.rowLabel}>
              This device
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {capabilityLabel(cap)}
            </ThemedText>
          </View>
        </View>

        <Section title="On-device labeling">
          <RuntimeCard />
        </Section>

        {recommended ? (
          <Section title="On this device">
            <Pressable
              accessibilityLabel="Automatic"
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface },
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => select(null)}
            >
              <View style={styles.rowText}>
                <View style={styles.nameLine}>
                  <ThemedText variant="body" style={styles.rowLabel}>
                    Automatic
                  </ThemedText>
                </View>
                <ThemedText variant="bodySmall" color="secondary">
                  {`Follows our suggestion — currently ${recommended.name}`}
                </ThemedText>
              </View>
              <Icon
                name={selectedModelId === null ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={selectedModelId === null ? colors.accent : colors.textDisabled}
              />
            </Pressable>
            {localModels.map(renderModelRow)}
          </Section>
        ) : (
          <Section title="On this device">
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <Icon name="cloud-offline-outline" size={22} color={colors.iconInactive} />
              <View style={styles.rowText}>
                <ThemedText variant="body" style={styles.rowLabel}>
                  Local models unavailable
                </ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  This device can&apos;t run on-device models — classification will use the cloud
                  when it&apos;s available.
                </ThemedText>
              </View>
            </View>
          </Section>
        )}

        <Section title="Cloud">{cloudModels.map(renderModelRow)}</Section>

        <ThemedText variant="bodySmall" color="secondary" style={styles.footnote}>
          Your choice applies when on-device AI ships in a future update. Local models never send
          your photos anywhere.
        </ThemedText>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { marginBottom: 10 },
  runtimeCard: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDisabled: { opacity: 0.55 },
  rowLabel: { flex: 1 },
  rowText: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  footnote: { marginTop: 20, paddingHorizontal: 32, lineHeight: 18, textAlign: 'center' },
  progressBlock: { gap: 8, paddingVertical: 4 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  errorText: { lineHeight: 18 },
  actionButton: { borderRadius: 14, alignItems: 'center', paddingVertical: 13 },
  actionButtonText: { color: '#FFFFFF', fontWeight: '600' },
  buttonDisabled: { opacity: 0.55 },
  textButtonRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  textButton: { paddingVertical: 4 },
});
