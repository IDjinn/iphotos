import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { listAlbums } from '@/data/albums-repository';
import { listTopLabels, searchAssetIdsByLabel } from '@/data/labels-repository';
import { queryAssets } from '@/data/media-repository';
import { parseQuery } from '@/data/search-providers';
import { addRecentSearch, clearRecentSearches, listRecentSearches, removeRecentSearch } from '@/data/search-repository';
import type { AlbumRecord, PhotoAsset } from '@/data/types';
import { useClassificationStore } from '@/stores/classification';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const QUICK_CHIPS = ['Today', 'Yesterday', 'Videos', 'Photos', 'Favorites'];

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<PhotoAsset[] | null>(null);
  const [searching, setSearching] = useState(false);
  const localSearchEnabled = useClassificationStore((s) => s.localEnabled);
  const indexationRunning = useClassificationStore((s) => s.running);
  const [topLabels, setTopLabels] = useState<string[]>([]);

  useEffect(() => {
    setAlbums(listAlbums());
    setRecents(listRecentSearches());
  }, []);

  useEffect(() => {
    if (localSearchEnabled && !indexationRunning) setTopLabels(listTopLabels());
  }, [localSearchEnabled, indexationRunning]);

  const parsed = useMemo(() => parseQuery(query), [query]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const parsedQuery = parseQuery(query);
      if (parsedQuery.mediaType || parsedQuery.createdAfter !== undefined) {
        const page = await queryAssets({
          mediaTypes: parsedQuery.mediaType ? [parsedQuery.mediaType] : undefined,
          createdAfter: parsedQuery.createdAfter,
          createdBefore: parsedQuery.createdBefore,
          limit: 300,
          excludeIds: undefined,
        });
        if (!cancelled) setResults(page.assets);
      } else if (localSearchEnabled) {
        // Free text matches the on-device label index (folder-derived for now).
        const labelIds = searchAssetIdsByLabel(query);
        if (labelIds.length > 0) {
          const page = await queryAssets({ ids: labelIds, limit: 200 });
          if (!cancelled) setResults(page.assets);
        } else if (!cancelled) {
          setResults([]);
        }
      } else {
        if (!cancelled) setResults([]);
      }
      if (!cancelled) setSearching(false);
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, localSearchEnabled]);

  const matchedAlbums = useMemo(() => {
    if (!parsed.albumMatch) return [];
    const needle = parsed.albumMatch.toLowerCase();
    return albums.filter((a) => a.title.toLowerCase().includes(needle));
  }, [albums, parsed.albumMatch]);

  const commitSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    addRecentSearch(trimmed);
    setRecents(listRecentSearches());
  }, []);

  const showResults = query.trim().length > 0;

  return (
    <TabSwipe tab="/search">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Search bar */}
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <Icon name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your photos"
            placeholderTextColor={colors.textDisabled}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
            onSubmitEditing={() => commitSearch(query)}
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable hitSlop={12} onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Icon name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!showResults ? (
        <View style={styles.suggestions}>
          {recents.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(180)}>
              <View style={styles.chipHeader}>
                <ThemedText variant="label">Recent searches</ThemedText>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    clearRecentSearches();
                    setRecents([]);
                  }}
                >
                  <ThemedText variant="bodySmall" color="accent">
                    Clear
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recents.map((recent) => (
                  <View key={recent} style={[styles.chipWithClose, { backgroundColor: colors.surface }]}>
                    <Pressable
                      onPress={() => {
                        haptic('light');
                        setQuery(recent);
                      }}
                    >
                      <ThemedText variant="bodySmall">{recent}</ThemedText>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        removeRecentSearch(recent);
                        setRecents(listRecentSearches());
                      }}
                      accessibilityLabel={`Remove ${recent}`}
                    >
                      <Icon name="close" size={14} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Animated.View>
          ) : null}

          <ThemedText variant="label" style={styles.chipLabel}>
            Quick filters
          </ThemedText>
          <View style={styles.chips}>
            {QUICK_CHIPS.map((chip) => (
              <Pressable
                key={chip}
                style={[styles.chip, { backgroundColor: colors.surface }]}
                onPress={() => {
                  haptic('light');
                  if (chip === 'Favorites') {
                    router.push('/album/favorites');
                  } else {
                    setQuery(chip);
                  }
                }}
              >
                <ThemedText variant="bodySmall">{chip}</ThemedText>
              </Pressable>
            ))}
          </View>

          {localSearchEnabled && topLabels.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(180)}>
              <View style={styles.chipHeader}>
                <ThemedText variant="label">Your labels</ThemedText>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    haptic('light');
                    router.push('/labels');
                  }}
                  accessibilityLabel="See all labels"
                >
                  <ThemedText variant="bodySmall" color="accent">
                    See all
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {topLabels.map((label) => (
                  <Pressable
                    key={label}
                    style={[styles.chip, { backgroundColor: colors.surface }]}
                    onPress={() => {
                      haptic('light');
                      router.push({ pathname: '/label/[label]', params: { label } });
                    }}
                    accessibilityLabel={`Open label ${label}`}
                  >
                    <ThemedText variant="bodySmall">{label}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          ) : null}

          <View style={[styles.aiCard, { backgroundColor: colors.surface }]}>
            <Icon name="sparkles-outline" size={22} color={colors.accent} />
            <View style={styles.aiCardText}>
              <ThemedText variant="body" style={styles.aiTitle}>
                People, places &amp; things
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {localSearchEnabled
                  ? 'Folder labels power search on this device. Pick your AI model in Settings — it activates with a future update.'
                  : 'Turn on Smart search in Settings to label your photos on this device.'}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : searching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
          {matchedAlbums.length > 0 ? (
            <View style={styles.albumMatches}>
              <ThemedText variant="label">Albums</ThemedText>
              <View style={styles.chips}>
                {matchedAlbums.map((album) => (
                  <Pressable
                    key={album.id}
                    style={[styles.chip, { backgroundColor: colors.surface }]}
                    onPress={() => router.push(`/album/${album.id}`)}
                  >
                    <ThemedText variant="bodySmall">{album.title}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {results && results.length > 0 ? (
            <PhotoGrid assets={results} context="search" stickyMonths={false} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle={
                parsed.freeText
                  ? 'Try a date like “August 2026”, a label like “screenshots”, or “Videos”.'
                  : 'Nothing found for this filter.'
              }
            />
          )}
        </Animated.View>
      )}
      </View>
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 26,
    paddingHorizontal: 14,
    height: 44,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suggestions: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  chipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipLabel: { marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  chipWithClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
  },
  aiCardText: { flex: 1, gap: 2 },
  aiTitle: { fontWeight: '500' },
  albumMatches: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
