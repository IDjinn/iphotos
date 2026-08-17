import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { listAllLabels, type LabelSummary } from '@/data/labels-repository';
import { useAiLabelingStore } from '@/stores/ai-labeling';
import { useClassificationStore } from '@/stores/classification';
import { useLocalMlStore } from '@/stores/local-ml';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/** Labels are stored lowercase — show them title-cased. */
function displayLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Full label browser. The Search tab only surfaces the top six labels as
 * chips; this screen lists every label with its photo count and opens the
 * label album (all its photos, no search cap). The reload button re-runs
 * indexing — folder heuristics plus the AI endpoint when one is configured.
 */
export default function LabelsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [filter, setFilter] = useState('');
  const [labels, setLabels] = useState<LabelSummary[]>(() => listAllLabels());
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? labels.filter((l) => l.label.includes(q)) : labels;
  }, [labels, filter]);

  const folderRunning = useClassificationStore((s) => s.running);
  const folderProgress = useClassificationStore((s) => s.progress);
  const folderError = useClassificationStore((s) => s.lastError);
  const aiRunning = useClassificationStore((s) => s.aiRunning);
  const aiProgress = useClassificationStore((s) => s.aiProgress);
  const aiError = useClassificationStore((s) => s.aiLastError);
  const aiConfigured = useAiLabelingStore((s) => s.endpoint.length > 0 && s.model.length > 0);
  const mlRunning = useLocalMlStore((s) => s.running);
  const mlProgress = useLocalMlStore((s) => s.progress);
  const mlError = useLocalMlStore((s) => s.lastError);
  const mlAvailable = useLocalMlStore((s) => s.downloading || s.modelReady);

  // SQLite rows land outside React's knowledge — reload the list whenever a
  // run starts/finishes, and poll while runs write so counts grow live.
  useEffect(() => {
    const unsubscribe = useClassificationStore.subscribe((state, prev) => {
      if (state.running !== prev.running || state.aiRunning !== prev.aiRunning) {
        setLabels(listAllLabels());
      }
    });
    const unsubscribeMl = useLocalMlStore.subscribe((state, prev) => {
      if (state.running !== prev.running) setLabels(listAllLabels());
    });
    return () => {
      unsubscribe();
      unsubscribeMl();
    };
  }, []);

  useEffect(() => {
    if (!aiRunning && !mlRunning) return;
    const t = setInterval(() => setLabels(listAllLabels()), 2000);
    return () => clearInterval(t);
  }, [aiRunning, mlRunning]);

  const reload = () => {
    haptic('light');
    void useClassificationStore.getState().runIndexation();
    if (aiConfigured) void useClassificationStore.getState().runAiIndexation();
    if (useLocalMlStore.getState().modelReady) void useLocalMlStore.getState().runLabeling();
  };

  const running = folderRunning || aiRunning || mlRunning;
  const aiPct =
    aiProgress && aiProgress.total > 0
      ? Math.min(100, Math.floor((aiProgress.scanned / aiProgress.total) * 100))
      : 0;
  const mlPct =
    mlProgress && mlProgress.total > 0
      ? Math.min(100, Math.floor((mlProgress.scanned / mlProgress.total) * 100))
      : 0;
  const folderPct =
    folderProgress && folderProgress.total > 0
      ? Math.min(100, Math.floor((folderProgress.scanned / folderProgress.total) * 100))
      : 0;
  const lastError = aiError ?? mlError ?? folderError;
  const barPct = aiRunning ? aiPct : mlRunning ? mlPct : folderPct;

  const statusText = aiRunning
    ? `AI labeling… ${aiPct}% (${aiProgress?.scanned.toLocaleString('en-US')} of ${aiProgress?.total.toLocaleString('en-US')})`
    : mlRunning
      ? `On-device labeling… ${mlPct}% (${mlProgress?.scanned.toLocaleString('en-US')} of ${mlProgress?.total.toLocaleString('en-US')})`
      : folderRunning
        ? folderProgress && folderProgress.total > 0
          ? `Indexing folders… ${folderPct}%`
          : 'Indexing folders…'
        : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          Labels
        </ThemedText>
        <Pressable hitSlop={12} onPress={reload} disabled={running} accessibilityLabel="Reload indexing">
          {running ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Icon name="refresh" size={22} />
          )}
        </Pressable>
      </View>

      <View style={styles.filterWrap}>
        <View style={[styles.filterBar, { backgroundColor: colors.surface }]}>
          <Icon name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter labels"
            placeholderTextColor={colors.textDisabled}
            style={[styles.filterInput, { color: colors.text }]}
            autoCorrect={false}
          />
          {filter.length > 0 ? (
            <Pressable hitSlop={12} onPress={() => setFilter('')} accessibilityLabel="Clear label filter">
              <Icon name="close-circle" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {statusText ? (
        <View style={styles.progressWrap}>
          <ThemedText variant="bodySmall" color="secondary" style={styles.statusText}>
            {statusText}
          </ThemedText>
          <View style={[styles.track, { backgroundColor: colors.outline }]}>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${barPct}%` }]} />
          </View>
        </View>
      ) : null}

      {labels.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="No labels yet"
          subtitle={
            aiConfigured || mlAvailable
              ? 'Tap the reload icon above to label your photos.'
              : 'Labels come from your device folders. For smart labels (beach, dog, food…), download the on-device model in Settings → AI model.'
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon="pricetag-outline" title="No labels match" subtitle="Try another word." />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.label}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
              onPress={() => {
                haptic('light');
                router.push({ pathname: '/label/[label]', params: { label: item.label } });
              }}
              accessibilityLabel={`Open label ${displayLabel(item.label)}`}
            >
              <Icon name="pricetag-outline" size={20} color={colors.icon} />
              <ThemedText variant="body" style={styles.rowLabel} numberOfLines={1}>
                {displayLabel(item.label)}
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {item.count.toLocaleString('en-US')}
              </ThemedText>
              <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
            </Pressable>
          )}
          ListFooterComponent={
            <View>
              {lastError ? (
                <ThemedText variant="bodySmall" color="danger" style={styles.footerError}>
                  {lastError}
                </ThemedText>
              ) : null}
              <ThemedText variant="bodySmall" color="secondary" style={styles.footer}>
                Labels come from your device folders and — when configured — from AI labeling
                (Settings → AI labeling).
              </ThemedText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: 56,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  filterWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 40,
  },
  filterInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  progressWrap: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  statusText: { textAlign: 'center' },
  track: { height: 5, borderRadius: 2.5, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 2.5 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowLabel: { flex: 1 },
  footerError: { textAlign: 'center', paddingTop: 14, lineHeight: 18 },
  footer: { textAlign: 'center', paddingTop: 14, lineHeight: 18 },
});
