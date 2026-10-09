import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import {
  AlbumMatches,
  Center,
  Chip,
  ChipHeader,
  ChipLabel,
  ChipRow,
  Header,
  Input,
  RecentChip,
  Screen,
  SearchBar,
  Suggestions,
} from '@/screens/(tabs)/search.styles';
import { listAlbums } from '@/data/albums-repository';
import { queryAssets } from '@/data/media-repository';
import { parseQuery } from '@/data/search-providers';
import { addRecentSearch, clearRecentSearches, listRecentSearches, removeRecentSearch } from '@/data/search-repository';
import type { AlbumRecord, PhotoAsset } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n/hook';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/** `token` is the canonical English query token `parseQuery` understands. */
const QUICK_CHIPS: { token: string; labelKey: TranslationKey }[] = [
  { token: 'Today', labelKey: 'search.chips.today' },
  { token: 'Yesterday', labelKey: 'search.chips.yesterday' },
  { token: 'Videos', labelKey: 'search.chips.videos' },
  { token: 'Photos', labelKey: 'search.chips.photos' },
  { token: 'Favorites', labelKey: 'search.chips.favorites' },
];

export default function SearchScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<PhotoAsset[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setAlbums(listAlbums());
    setRecents(listRecentSearches());
  }, []);

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
      } else {
        // Free text has no on-device index to match — results come from the
        // album-title matches above; the backend will own semantic search.
        if (!cancelled) setResults([]);
      }
      if (!cancelled) setSearching(false);
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
      <Screen $insetTop={insets.top}>
        {/* Search bar */}
        <Header>
          <SearchBar>
            <Icon name="search-outline" size={20} color={colors.textSecondary} />
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textDisabled}
              returnKeyType="search"
              onSubmitEditing={() => commitSearch(query)}
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable hitSlop={12} onPress={() => setQuery('')} accessibilityLabel={t('search.clearA11y')}>
                <Icon name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </SearchBar>
        </Header>

      {!showResults ? (
        <Suggestions>
          {recents.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(180)}>
              <ChipHeader>
                <ThemedText variant="label">{t('search.recentSearches')}</ThemedText>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    clearRecentSearches();
                    setRecents([]);
                  }}
                >
                  <ThemedText variant="bodySmall" color="accent">
                    {t('search.clear')}
                  </ThemedText>
                </Pressable>
              </ChipHeader>
              <ChipRow>
                {recents.map((recent) => (
                  <RecentChip key={recent}>
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
                      accessibilityLabel={t('search.removeRecent', { query: recent })}
                    >
                      <Icon name="close" size={14} color={colors.textSecondary} />
                    </Pressable>
                  </RecentChip>
                ))}
              </ChipRow>
            </Animated.View>
          ) : null}

          <ChipLabel variant="label">{t('search.quickFilters')}</ChipLabel>
          <ChipRow>
            {QUICK_CHIPS.map((chip) => (
              <Chip
                key={chip.token}
                onPress={() => {
                  haptic('light');
                  if (chip.token === 'Favorites') {
                    router.push('/album/favorites');
                  } else {
                    setQuery(chip.token);
                  }
                }}
              >
                <ThemedText variant="bodySmall">{t(chip.labelKey)}</ThemedText>
              </Chip>
            ))}
          </ChipRow>
        </Suggestions>
      ) : searching ? (
        <Center>
          <ActivityIndicator color={colors.accent} />
        </Center>
      ) : (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
          {matchedAlbums.length > 0 ? (
            <AlbumMatches>
              <ThemedText variant="label">{t('library.albums')}</ThemedText>
              <ChipRow>
                {matchedAlbums.map((album) => (
                  <Chip key={album.id} onPress={() => router.push(`/album/${album.id}`)}>
                    <ThemedText variant="bodySmall">{album.title}</ThemedText>
                  </Chip>
                ))}
              </ChipRow>
            </AlbumMatches>
          ) : null}

          {results && results.length > 0 ? (
            <PhotoGrid assets={results} context="search" stickyMonths={false} />
          ) : (
            <EmptyState
              icon="search-outline"
              title={t('search.noMatches')}
              subtitle={
                parsed.freeText
                  ? t('search.noMatchesFreeText')
                  : t('search.noMatchesFilter')
              }
            />
          )}
        </Animated.View>
      )}
      </Screen>
    </TabSwipe>
  );
}
