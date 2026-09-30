import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { deleteAlbum } from '@/data/albums-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import { readLockedConfig } from '@/data/locked-repository';
import { useLibraryStore } from '@/stores/library';
import { useTheme } from '@/theme/context';
import { formatCount } from '@/utils/format';
import { haptic } from '@/utils/haptics';

/** Utility card row at the top (Favorites / Locked Folder). */
function UtilityCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale style={[styles.utilityCard, { backgroundColor: colors.surface }]} onPress={onPress}>
      <View style={[styles.utilityIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.utilityMeta}>
        <ThemedText variant="body" style={styles.utilityTitle}>
          {title}
        </ThemedText>
        <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
    </PressableScale>
  );
}

export default function LibraryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const albums = useLibraryStore((s) => s.albums);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const lockedCount = useLibraryStore((s) => s.lockedIds.length);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [lockedEnabled, setLockedEnabled] = useState(false);

  useEffect(() => {
    readLockedConfig().then((config) => setLockedEnabled(config.enabled));
  }, []);

  // Resolve album covers (newest item) lazily.
  useEffect(() => {
    let cancelled = false;
    const targets = albums.filter((a) => a.coverAssetId).slice(0, 20);
    if (targets.length === 0) return;
    fetchAssetsByIds(targets.map((a) => a.coverAssetId!)).then((assets) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      assets.forEach((asset) => {
        map[asset.id] = asset.uri;
      });
      setCovers(map);
    });
    return () => {
      cancelled = true;
    };
  }, [albums]);

  const showAlbumMenu = (albumId: string, title: string) => {
    haptic('medium');
    Alert.alert(title, undefined, [
      {
        text: 'Rename',
        onPress: () => {
          // RN has no built-in prompt on Android; rename inline via alert input workaround:
          Alert.alert('Rename album', 'Rename is available from the album screen header.', [{ text: 'OK' }]);
        },
      },
      {
        text: 'Delete album',
        style: 'destructive',
        onPress: () => {
          Alert.alert(`Delete “${title}”?`, 'Photos stay in your library — only the album is removed.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                deleteAlbum(albumId);
                refreshLibrary();
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const createNewAlbum = () => {
    haptic('medium');
    // Inline creation happens through the picker sheet elsewhere; here we
    // open the picker-style flow via a simple alert on Android-compatible path.
    router.push('/album/new');
  };

  return (
    <TabSwipe tab="/library">
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <ThemedText variant="display">Library</ThemedText>
        <PressableScale hitSlop={8} onPress={createNewAlbum} accessibilityLabel="Create album">
          <Icon name="add" size={26} color={colors.accent} />
        </PressableScale>
      </View>

      <View style={styles.utilities}>
        <UtilityCard
          icon="heart"
          title="Favorites"
          subtitle={formatCount(favoriteIds.length, 'item', 'items')}
          onPress={() => router.push('/album/favorites')}
        />
        <UtilityCard
          icon={lockedEnabled ? 'lock-closed' : 'lock-closed-outline'}
          title="Locked Folder"
          subtitle={lockedEnabled ? formatCount(lockedCount, 'item', 'items') : 'Set up private storage'}
          onPress={() => router.push('/locked')}
        />
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText variant="label">Albums</ThemedText>
      </View>

      {albums.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="No albums yet"
          subtitle="Create an album to organize your favorite moments."
        />
      ) : (
        <View style={styles.albumGrid}>
          {albums.map((album, i) => {
            const cover = album.coverAssetId ? covers[album.coverAssetId] : undefined;
            return (
              <Animated.View key={album.id} entering={FadeInDown.delay(Math.min(i * 40, 240)).springify().dampingRatio(0.85)} style={styles.albumCardWrap}>
                <Pressable
                  onPress={() => {
                    haptic('light');
                    router.push(`/album/${album.id}`);
                  }}
                  onLongPress={() => showAlbumMenu(album.id, album.title)}
                >
                  <View style={[styles.albumCover, { backgroundColor: colors.placeholder }]}>
                    {cover ? (
                      <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                    ) : (
                      <Icon name="images-outline" size={26} color={colors.textSecondary} />
                    )}
                  </View>
                  <ThemedText variant="bodySmall" numberOfLines={1} style={styles.albumTitle}>
                    {album.title}
                  </ThemedText>
                  <ThemedText variant="bodySmall" color="secondary">
                    {formatCount(album.itemCount, 'item', 'items')}
                  </ThemedText>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
      </ScrollView>
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  utilities: { paddingHorizontal: 16, gap: 8, paddingTop: 4 },
  utilityCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14 },
  utilityIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  utilityMeta: { flex: 1, gap: 1 },
  utilityTitle: { fontWeight: '500' },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  albumCardWrap: { width: '47.5%' },
  albumCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  albumTitle: { paddingTop: 8, fontWeight: '500' },
});
