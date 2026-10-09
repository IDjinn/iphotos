import { useCallback, useMemo, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { Alert, Pressable, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Card,
  CardText,
  EmptyText,
  FilterChip,
  FilterRow,
  FolderRow,
  Group,
  GroupTitle,
  Header,
  HeaderSpacer,
  HeaderTitle,
  HeldRow,
  Note,
  Pill,
  Screen,
  Search,
  Summary,
} from '@/screens/settings/backup/folders.styles';
import { runFolderScan } from '@/data/backup-inventory';
import {
  getBackupFolderViews,
  getHeldFolderViews,
  type BackupFolderView,
} from '@/data/backup-folders';
import { setSyncRule } from '@/data/sync-rules-repository';
import { isExpoGo } from '@/data/native-crypto';
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
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    <Screen
      contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
    >
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">Backup folders</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <Body>
        {held.length > 0 ? (
          <Group>
            <GroupTitle variant="label">Needs a decision</GroupTitle>
            <Card>
              {held.map((view, index) => (
                <HeldRow key={view.id} $divided={index > 0}>
                  <CardText>
                    <ThemedText variant="body">{view.title}</ThemedText>
                    <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                      {view.items.toLocaleString('en-US')} items · {formatBytes(view.bytes)} — new folder, not backed
                      up until you decide
                    </ThemedText>
                  </CardText>
                  <Pill $tone="accent" onPress={() => applyRule(view, 'include')} accessibilityLabel={`Include ${view.title}`}>
                    <ThemedText variant="bodySmall" color="accent">
                      Include
                    </ThemedText>
                  </Pill>
                  <Pill $tone="outline" onPress={() => applyRule(view, 'exclude')} accessibilityLabel={`Exclude ${view.title}`}>
                    <ThemedText variant="bodySmall" color="secondary">
                      Exclude
                    </ThemedText>
                  </Pill>
                </HeldRow>
              ))}
            </Card>
          </Group>
        ) : null}

        <Search
          value={query}
          onChangeText={setQuery}
          placeholder="Search folders"
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel="Search folders"
        />

        <FilterRow>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <FilterChip
                key={f.key}
                $active={active}
                onPress={() => {
                  haptic('light');
                  setFilter(f.key);
                }}
                accessibilityLabel={`${f.label} folders`}
              >
                <ThemedText variant="bodySmall" color={active ? 'accent' : 'secondary'}>
                  {f.label}
                </ThemedText>
              </FilterChip>
            );
          })}
        </FilterRow>

        <Card>
          {filtered.length === 0 ? (
            <EmptyText variant="bodySmall" color="secondary">
              {views === null
                ? 'Loading folders…'
                : views.length === 0
                  ? isExpoGo
                    ? 'The Expo Go preview cannot access the device library — run the native build.'
                    : 'No inventory yet — run a scan from the Backup screen first.'
                  : 'No folders match this view.'}
            </EmptyText>
          ) : (
            filtered.map((view, index) => (
              <FolderRow key={view.id} $divided={index > 0}>
                <CardText>
                  <ThemedText variant="body">{view.title}</ThemedText>
                  <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                    {view.items.toLocaleString('en-US')} items · {formatBytes(view.bytes)} — {statusCaption(view)}
                  </ThemedText>
                </CardText>
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
              </FolderRow>
            ))
          )}
        </Card>

        {summary ? (
          <Summary variant="bodySmall" color="secondary">
            {summary}
          </Summary>
        ) : null}

        <Note variant="bodySmall" color="secondary">
          Rules apply at the next scan — unchanged photos are never re-hashed or re-uploaded. The Locked Folder and
          the Safe Folder never enter the backup.
        </Note>
      </Body>
    </Screen>
  );
}
