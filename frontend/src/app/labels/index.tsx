import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  FilterBar,
  FilterInput,
  FilterWrap,
  FooterNote,
  Header,
  HeaderTitle,
  LabelRow,
  ProgressWrap,
  RowLabel,
  Screen,
  StatusText,
  Track,
  TrackFill,
} from '@/app/labels/index.styles';
import { listAllLabels, type LabelSummary } from '@/data/labels-repository';
import { useTranslation } from '@/i18n/hook';
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
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, localeTag } = useTranslation();

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
    ? t('labelsScreen.statusAi', {
        percent: aiPct,
        count: (aiProgress?.scanned ?? 0).toLocaleString(localeTag),
        total: (aiProgress?.total ?? 0).toLocaleString(localeTag),
      })
    : mlRunning
      ? t('labelsScreen.statusOnDevice', {
          percent: mlPct,
          count: (mlProgress?.scanned ?? 0).toLocaleString(localeTag),
          total: (mlProgress?.total ?? 0).toLocaleString(localeTag),
        })
      : folderRunning
        ? folderProgress && folderProgress.total > 0
          ? t('labelsScreen.statusFoldersPct', { percent: folderPct })
          : t('labelsScreen.statusFolders')
        : null;

  return (
    <Screen>
      <Header $insetTop={insets.top + space[1]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('labelsScreen.title')}</HeaderTitle>
        <Pressable hitSlop={12} onPress={reload} disabled={running} accessibilityLabel={t('labelsScreen.reloadA11y')}>
          {running ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Icon name="refresh" size={22} />
          )}
        </Pressable>
      </Header>

      <FilterWrap>
        <FilterBar>
          <Icon name="search-outline" size={18} color={colors.textSecondary} />
          <FilterInput
            value={filter}
            onChangeText={setFilter}
            placeholder={t('labelsScreen.filterPlaceholder')}
            placeholderTextColor={colors.textDisabled}
            autoCorrect={false}
          />
          {filter.length > 0 ? (
            <Pressable hitSlop={12} onPress={() => setFilter('')} accessibilityLabel={t('labelsScreen.clearFilterA11y')}>
              <Icon name="close-circle" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </FilterBar>
      </FilterWrap>

      {statusText ? (
        <ProgressWrap>
          <StatusText variant="bodySmall" color="secondary">
            {statusText}
          </StatusText>
          <Track>
            <TrackFill $pct={barPct} />
          </Track>
        </ProgressWrap>
      ) : null}

      {labels.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title={t('labelsScreen.emptyTitle')}
          subtitle={
            aiConfigured || mlAvailable
              ? t('labelsScreen.emptyHintReload')
              : t('labelsScreen.emptyHintSetup')
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title={t('labelsScreen.noMatchTitle')}
          subtitle={t('labelsScreen.noMatchSubtitle')}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.label}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 8 }}
          renderItem={({ item }) => (
            <LabelRowItem
              label={item.label}
              count={item.count}
              onPress={() =>
                router.push({ pathname: '/label/[label]', params: { label: item.label } })
              }
            />
          )}
          ListFooterComponent={
            <>
              {lastError ? (
                <FooterNote variant="bodySmall" color="danger">
                  {lastError}
                </FooterNote>
              ) : null}
              <FooterNote variant="bodySmall" color="secondary">
                {t('labelsScreen.footerNote')}
              </FooterNote>
            </>
          }
        />
      )}
    </Screen>
  );
}

function LabelRowItem({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const { t, localeTag } = useTranslation();
  const [pressed, setPressed] = useState(false);
  return (
    <LabelRow
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityLabel={t('search.openLabel', { label: displayLabel(label) })}
    >
      <Icon name="pricetag-outline" size={20} color={colors.icon} />
      <RowLabel variant="body" numberOfLines={1}>
        {displayLabel(label)}
      </RowLabel>
      <ThemedText variant="bodySmall" color="secondary">
        {count.toLocaleString(localeTag)}
      </ThemedText>
      <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
    </LabelRow>
  );
}
