import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { LabeledInput } from '@/components/LabeledInput';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import { useAiLabelingStore } from '@/stores/ai-labeling';
import { useClassificationStore } from '@/stores/classification';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/**
 * Sets up the AI labeling endpoint: any OpenAI-compatible vision server
 * (api.openai.com, OpenRouter, or a local Ollama/LM Studio instance). Photos
 * are sent there as base64 to generate labels — the honest privacy trade is
 * stated right on the screen, and nothing is sent until this is configured.
 */
export default function AiLabelingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const endpoint = useAiLabelingStore((s) => s.endpoint);
  const model = useAiLabelingStore((s) => s.model);
  const hasApiKey = useAiLabelingStore((s) => s.hasApiKey);
  const setConfig = useAiLabelingStore((s) => s.setConfig);
  const setApiKey = useAiLabelingStore((s) => s.setApiKey);

  const aiRunning = useClassificationStore((s) => s.aiRunning);
  const aiProgress = useClassificationStore((s) => s.aiProgress);
  const aiLastError = useClassificationStore((s) => s.aiLastError);
  const runAiIndexation = useClassificationStore((s) => s.runAiIndexation);

  const [endpointDraft, setEndpointDraft] = useState(endpoint);
  const [modelDraft, setModelDraft] = useState(model);
  const [keyDraft, setKeyDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const configured = endpoint.length > 0 && model.length > 0;
  const pct =
    aiProgress && aiProgress.total > 0
      ? Math.min(100, Math.floor((aiProgress.scanned / aiProgress.total) * 100))
      : aiRunning
        ? 0
        : null;

  const save = async () => {
    haptic('light');
    setConfig(endpointDraft, modelDraft);
    if (keyDraft.trim().length > 0) await setApiKey(keyDraft);
    setKeyDraft('');
    setToast('Saved');
  };

  const start = () => {
    haptic('light');
    void runAiIndexation();
  };

  const confirmRedo = () => {
    haptic('light');
    Alert.alert(
      'Redo all AI labels?',
      'Existing AI labels are deleted and every photo is sent to the endpoint again. Folder labels are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redo', style: 'destructive', onPress: () => void runAiIndexation(true) },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium" style={styles.headerTitle}>
            AI labeling
          </ThemedText>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Icon name="color-wand-outline" size={22} color={colors.icon} />
            <View style={styles.cardText}>
              <ThemedText variant="body">Smart labels for your photos</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                Connect any OpenAI-compatible vision endpoint. Each photo is sent there to generate
                labels like “beach”, “dog” or “document”.
              </ThemedText>
            </View>
          </View>

          <View style={styles.form}>
            <LabeledInput
              label="Endpoint URL"
              value={endpointDraft}
              onChangeText={setEndpointDraft}
              placeholder="https://api.openai.com/v1"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
            />
            <LabeledInput
              label="Model"
              value={modelDraft}
              onChangeText={setModelDraft}
              placeholder="gpt-4o-mini"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <LabeledInput
              label={hasApiKey ? 'API key (stored — leave blank to keep)' : 'API key (optional for local servers)'}
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder={hasApiKey ? '••••••••' : 'sk-…'}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.accent },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => void save()}
            >
              <ThemedText variant="body" style={styles.primaryButtonText}>
                Save
              </ThemedText>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardText}>
              <ThemedText variant="body">
                {configured ? 'Label your photos' : 'Not configured yet'}
              </ThemedText>
              {aiRunning ? (
                <View style={styles.progressBlock}>
                  <View style={styles.progressLine}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      {pct !== null
                        ? `Labeling… ${pct}% (${aiProgress?.scanned.toLocaleString('en-US')} of ${aiProgress?.total.toLocaleString('en-US')})`
                        : 'Starting…'}
                    </ThemedText>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.outline }]}>
                    <View style={[styles.fill, { backgroundColor: colors.accent, width: `${pct ?? 0}%` }]} />
                  </View>
                </View>
              ) : (
                <ThemedText variant="bodySmall" color="secondary">
                  {configured
                    ? 'Runs in the background — already-labeled photos are skipped, so you can stop and resume anytime.'
                    : 'Save an endpoint and model above to enable AI labeling.'}
                </ThemedText>
              )}
              {aiLastError ? (
                <ThemedText variant="bodySmall" color="danger" style={styles.errorText}>
                  {aiLastError}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {configured ? (
            <Pressable
              disabled={aiRunning}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.accent },
                aiRunning && styles.buttonDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={start}
            >
              <ThemedText variant="body" style={styles.primaryButtonText}>
                {aiRunning ? 'Labeling…' : 'Label photos now'}
              </ThemedText>
            </Pressable>
          ) : null}
          {configured && !aiRunning ? (
            <Pressable style={styles.textButton} onPress={confirmRedo}>
              <ThemedText variant="bodySmall" color="danger">
                Delete AI labels and redo from scratch
              </ThemedText>
            </Pressable>
          ) : null}

          <ThemedText variant="bodySmall" color="secondary" style={styles.footnote}>
            Photos are sent to the endpoint you choose, exactly as on-device AI ships later this
            year — that version will never leave your phone. Works with OpenAI, OpenRouter, Ollama
            (http://localhost:11434/v1) and LM Studio.
          </ThemedText>
        </View>
      </ScrollView>
      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  body: { paddingHorizontal: 16, gap: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardText: { flex: 1, gap: 4 },
  form: { gap: 14 },
  primaryButton: {
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '600' },
  buttonDisabled: { opacity: 0.55 },
  textButton: { alignItems: 'center', paddingVertical: 6 },
  progressBlock: { gap: 8, paddingVertical: 4 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  errorText: { lineHeight: 18 },
  footnote: { lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
});
