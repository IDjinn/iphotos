import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { countLabeledAssets } from '@/data/labels-repository';
import { resolveActiveModel } from '@/stores/ai-model';
import { useAiLabelingStore } from '@/stores/ai-labeling';
import { useAccountStore } from '@/stores/account';
import { useClassificationStore } from '@/stores/classification';
import { useSettingsStore } from '@/stores/settings';
import type { ThemeMode } from '@/theme/context';
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

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const account = useAccountStore();
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
  const modelName = useMemo(() => resolveActiveModel()?.name ?? 'Cloud only — coming soon', []);

  // SQLite writes land outside React's knowledge — refresh when a run finishes.
  useEffect(() => {
    const unsubscribe = useClassificationStore.subscribe((state, prev) => {
      if (!state.running && prev.running) setLabeledCount(countLabeledAssets());
    });
    return unsubscribe;
  }, []);

  const searchCaption = !localSearchEnabled
    ? 'Off'
    : indexationRunning
      ? indexationProgress && indexationProgress.total > 0
        ? `Indexing… ${Math.min(
            100,
            Math.floor((indexationProgress.scanned / indexationProgress.total) * 100)
          )}% (${formatCount(indexationProgress.scanned)} of ${formatCount(indexationProgress.total)})`
        : 'Indexing your library…'
      : labeledCount > 0
        ? `${formatCount(labeledCount)} items labeled on this device`
        : 'Labels your folders on this device';

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
          Settings
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <Animated.View entering={FadeInDown.duration(200)}>
        <Section title="Account">
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
            onPress={() => {
              haptic('light');
              router.push('/login');
            }}
            accessibilityLabel="Account settings"
          >
            <Icon name="person-circle-outline" size={22} color={colors.icon} />
            <View style={styles.rowText}>
              <ThemedText variant="body">{account.user ? account.user.email : 'Local mode'}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {account.user ? 'Cloud · manage account' : 'No account · set up cloud backup'}
              </ThemedText>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </Pressable>
        </Section>

        <Section title="Backup & sync">
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <Icon name="cloud-offline-outline" size={22} color={colors.iconInactive} />
            <View style={styles.rowText}>
              <ThemedText variant="body" style={styles.rowLabel}>
                Backup
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                Requires Cloud mode — coming in a future update
              </ThemedText>
            </View>
          </View>
          <View style={[styles.row, { backgroundColor: colors.surface, marginTop: 8 }]}>
            <Icon name="archive-outline" size={22} color={colors.iconInactive} />
            <View style={styles.rowText}>
              <ThemedText variant="body" style={styles.rowLabel}>
                Import from ZIP
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                Coming soon
              </ThemedText>
            </View>
          </View>
        </Section>

        <Section title="Appearance">
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((option) => {
              const active = themeMode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  style={[
                    styles.themeOption,
                    { backgroundColor: active ? colors.accentSoft : colors.surface },
                    { borderColor: active ? colors.accent : 'transparent' },
                  ]}
                  onPress={() => {
                    haptic('light');
                    setThemeMode(option.mode);
                  }}
                >
                  <Icon name={option.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                  <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Feedback">
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <Icon name="radio-outline" size={22} color={colors.icon} />
            <ThemedText variant="body" style={styles.rowLabel}>
              Haptic feedback
            </ThemedText>
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => {
                haptic('medium');
                setHapticsEnabled(v);
              }}
              trackColor={{ true: colors.accent, false: colors.outline }}
            />
          </View>
        </Section>

        <Section title="Privacy">
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface }, pressed && { opacity: 0.75 }]}
            onPress={() => {
              haptic('light');
              router.push('/locked');
            }}
          >
            <Icon name="lock-closed-outline" size={22} color={colors.icon} />
            <ThemedText variant="body" style={styles.rowLabel}>
              Locked Folder
            </ThemedText>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </Pressable>
          <View style={[styles.row, { backgroundColor: colors.surface, marginTop: 8 }]}>
            <Icon name="sparkles-outline" size={22} color={colors.icon} />
            <View style={styles.rowText}>
              <ThemedText variant="body" style={styles.rowLabel}>
                Smart search &amp; labels
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {searchCaption}
              </ThemedText>
              {localSearchEnabled && indexationError ? (
                <ThemedText variant="bodySmall" color="danger">
                  {indexationError}
                </ThemedText>
              ) : null}
            </View>
            <Switch
              value={localSearchEnabled}
              onValueChange={(v) => {
                haptic('medium');
                setLocalSearchEnabled(v);
              }}
              trackColor={{ true: colors.accent, false: colors.outline }}
              accessibilityLabel="Smart search and labels"
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, marginTop: 8 }, pressed && { opacity: 0.75 }]}
            onPress={() => {
              haptic('light');
              router.push('/settings/ai-labeling');
            }}
            accessibilityLabel="AI labeling"
          >
            <Icon name="color-wand-outline" size={22} color={colors.icon} />
            <View style={styles.rowText}>
              <ThemedText variant="body" style={styles.rowLabel}>
                AI labeling
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {aiEndpoint && aiModel ? `${aiHost(aiEndpoint)} · ${aiModel}` : 'Not configured — tap to set up'}
              </ThemedText>
              {aiRunning && aiProgress && aiProgress.total > 0 ? (
                <ThemedText variant="bodySmall" color="secondary">
                  {`Labeling… ${Math.min(
                    100,
                    Math.floor((aiProgress.scanned / aiProgress.total) * 100)
                  )}% (${formatCount(aiProgress.scanned)} of ${formatCount(aiProgress.total)})`}
                </ThemedText>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, marginTop: 8 }, pressed && { opacity: 0.75 }]}
            onPress={() => {
              haptic('light');
              router.push('/settings/ai-model');
            }}
            accessibilityLabel="AI model"
          >
            <Icon name="cube-outline" size={22} color={colors.icon} />
            <View style={styles.rowText}>
              <ThemedText variant="body" style={styles.rowLabel}>
                AI model
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {modelName}
              </ThemedText>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
          </Pressable>
        </Section>

        <Section title="About">
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <Icon name="information-circle-outline" size={22} color={colors.icon} />
            <ThemedText variant="body" style={styles.rowLabel}>
              Version
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary">
              {Constants.expoConfig?.version ?? '0.1.0'}
            </ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.license}>
            Licensed for non-commercial use — see LICENSE (PolyForm Noncommercial).
          </ThemedText>
        </Section>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { marginBottom: 10 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { flex: 1 },
  rowText: { flex: 1, gap: 2 },
  license: { marginTop: 14, lineHeight: 18, textAlign: 'center' },
});
