import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { runFolderScan } from '@/data/backup-inventory';
import {
  getBackupFolderViews,
  getHeldFolderViews,
  type BackupFolderView,
} from '@/data/backup-folders';
import { setSyncRule } from '@/data/sync-rules-repository';
import { isExpoGo } from '@/data/native-crypto';
import { useAccountStore } from '@/stores/account';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatBytes } from '@/utils/format';

/**
 * Backup folders — docs/plans/04-pastas-sync-ignore.md §3.
 * Per-folder include/exclude toggles backed by `sync_rules`. Excluding a
 * folder with already-uploaded photos confirms with a "keep in the cloud"
 * notice — remote removal (tombstones + grace) arrives with stage 03E.
 */

type FolderFilter = 'all' | 'included' | 'excluded';

const FILTERS: { key: FolderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'included', label: 'Included' },
  { key: 'excluded', label: 'Excluded' },
];

function statusCaption(view: BackupFolderView): string {
  switch (view.status) {
    case 'held':
      return 'Awaiting your decision';
    case 'excluded':
      return 'Out of the backup cycle';
    case 'missing':
      return 'Not found on this device';
    default:
      return view.uploaded > 0 ? `${view.uploaded.toLocaleString('en-US')} backed up` : 'Not backed up yet';
  }
}

export default function BackupFoldersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mode = useAccountStore((s) => s.mode);
  const [views, setViews] = useState<BackupFolderView[] | null>(null);
  const [held, setHeld] = useState<BackupFolderView[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FolderFilter>('all');

  const refresh = useCallback(() => {
    void getBackupFolderViews()
      .then(setViews)
      .catch(() => setViews([]));
    void getHeldFolderViews()
      .then(setHeld)
      .catch(() => setHeld([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const applyRule = useCallback(
    (view: BackupFolderView, next: 'include' | 'exclude') => {
      haptic('light');
      setSyncRule(view.id, next);
      // Reconcile the folder's device reality in the background; the UI is
      // already consistent through the rule reconciliation.
      void runFolderScan(view.id).catch(() => undefined);
      refresh();
    },
    [refresh]
  );

  const onToggle = useCallback(
    (view: BackupFolderView, value: boolean) => {
      if (value) {
        applyRule(view, 'include');
        return;
      }
      if (view.uploaded > 0) {
        const estimate = `${view.items.toLocaleString('en-US')} items · ${formatBytes(view.bytes)}`;
        Alert.alert(
          `Exclude ${view.title}?`,
          `${estimate} will leave the backup cycle. Photos already backed up stay in your cloud storage.`
            + ` Removing them from the cloud is not available yet.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Keep in cloud', style: 'default', onPress: () => applyRule(view, 'exclude') },
          ]
        );
        return;
      }
      applyRule(view, 'exclude');
    },
    [applyRule]
  );

  const filtered = useMemo(() => {
    if (!views) return [];
    const q = query.trim().toLowerCase();
    return views.filter((view) => {
      if (q.length > 0 && !view.title.toLowerCase().includes(q)) return false;
      if (filter === 'included') return view.status === 'included' || view.status === 'held';
      if (filter === 'excluded') return view.status === 'excluded';
      return true;
    });
  }, [views, query, filter]);

  const summary = useMemo(() => {
    if (!views) return null;
    const active = views.filter((v) => v.status === 'included' || v.status === 'held');
    const backedUpBytes = active.reduce((sum, v) => sum + v.uploadedBytes, 0);
    return `${active.length} of ${views.length} folders · ${formatBytes(backedUpBytes)} backed up`;
  }, [views]);

  const isExcluded = (view: BackupFolderView) => view.rule === 'exclude';

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
          Backup folders
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {mode !== 'cloud' ? (
          <View style={[styles.noteCard, { backgroundColor: colors.surface }]}>
            <Icon name="information-circle-outline" size={20} color={colors.accent} />
            <ThemedText variant="bodySmall" color="secondary" style={{ flex: 1 }}>
              Folder rules are saved now and applied when Cloud mode is on.
            </ThemedText>
          </View>
        ) : null}

        {held.length > 0 ? (
          <View style={styles.group}>
            <ThemedText variant="label" style={styles.groupTitle}>
              Needs a decision
            </ThemedText>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {held.map((view, index) => (
                <View
                  key={view.id}
                  style={[styles.heldRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outline }]}
                >
                  <View style={styles.cardText}>
                    <ThemedText variant="body">{view.title}</ThemedText>
                    <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                      {view.items.toLocaleString('en-US')} items · {formatBytes(view.bytes)} — new folder, not backed
                      up until you decide
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.pill, { backgroundColor: colors.accentSoft }]}
                    onPress={() => applyRule(view, 'include')}
                    accessibilityLabel={`Include ${view.title}`}
                  >
                    <ThemedText variant="bodySmall" color="accent">
                      Include
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.pill, { backgroundColor: colors.outline }]}
                    onPress={() => applyRule(view, 'exclude')}
                    accessibilityLabel={`Exclude ${view.title}`}
                  >
                    <ThemedText variant="bodySmall" color="secondary">
                      Exclude
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search folders"
          placeholderTextColor={colors.textDisabled}
          style={[styles.search, { backgroundColor: colors.surface, color: colors.text }]}
          accessibilityLabel="Search folders"
        />

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, { backgroundColor: active ? colors.accentSoft : colors.surface }]}
                onPress={() => {
                  haptic('light');
                  setFilter(f.key);
                }}
                accessibilityLabel={`${f.label} folders`}
              >
                <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                  {f.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {filtered.length === 0 ? (
            <ThemedText variant="bodySmall" color="secondary" style={styles.emptyText}>
              {views === null
                ? 'Loading folders…'
                : views.length === 0
                  ? isExpoGo
                    ? 'The Expo Go preview cannot access the device library — run the native build.'
                    : 'No inventory yet — run a scan from the Backup screen first.'
                  : 'No folders match this view.'}
            </ThemedText>
          ) : (
            filtered.map((view, index) => (
              <View
                key={view.id}
                style={[
                  styles.folderRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outline },
                ]}
              >
                <View style={styles.cardText}>
                  <ThemedText variant="body">{view.title}</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    {view.items.toLocaleString('en-US')} items · {formatBytes(view.bytes)} — {statusCaption(view)}
                  </ThemedText>
                </View>
                {view.status === 'held' ? (
                  <ThemedText variant="bodySmall" color="accent">
                    Pending
                  </ThemedText>
                ) : (
                  <Switch
                    value={!isExcluded(view)}
                    onValueChange={(value) => onToggle(view, value)}
                    trackColor={{ false: colors.outline, true: colors.accent }}
                    ios_backgroundColor={colors.outline}
                    accessibilityLabel={`Back up ${view.title}`}
                  />
                )}
              </View>
            ))
          )}
        </View>

        {summary ? (
          <ThemedText variant="bodySmall" color="secondary" style={styles.summary}>
            {summary}
          </ThemedText>
        ) : null}

        <ThemedText variant="bodySmall" color="secondary" style={styles.note}>
          Rules apply at the next scan — unchanged photos are never re-hashed or re-uploaded. The Locked Folder and
          the Safe Folder never enter the backup.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  group: { gap: 8 },
  groupTitle: { textTransform: 'uppercase' },
  card: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, overflow: 'hidden' },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  heldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  cardText: { flex: 1, gap: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  search: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  emptyText: { paddingVertical: 14, textAlign: 'center' },
  summary: { textAlign: 'center' },
  note: { lineHeight: 18, textAlign: 'center', marginTop: 8 },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
});
