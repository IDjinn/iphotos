import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { CloudVideoPlayer } from '@/components/CloudVideoPlayer';
import { prefetchRecentPreviews } from '@/data/cloud-media-cache';
import {
  deletePhoto,
  downloadFile,
  listPhotos,
  type CloudPhoto,
} from '@/data/cloud-photos-repository';
import { useCloudThumbnailUri } from '@/hooks/use-cloud-file';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { formatDuration } from '@/utils/format';

const PAGE_SIZE = 60;

type MediaTypeFilter = 'All' | 'Photo' | 'Video';
type SortOrder = 'desc' | 'asc';

const MEDIA_FILTERS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Photo', label: 'Photos' },
  { value: 'Video', label: 'Videos' },
];

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CloudPhoto[]; page: number; totalPages: number; loadingMore: boolean };

interface CloudGalleryProps {
  /** Shown instead of the default "run a backup" hint when the cloud is empty. */
  emptyHint?: string;
  contentContainerStyle?: { paddingBottom: number };
}

/** Grid cell rendering the cached thumbnail, downloading it on first view. */
function CloudPhotoCell({
  item,
  isReadyVideo,
  colors,
  onPress,
}: {
  item: CloudPhoto;
  isReadyVideo: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  const thumbnailUri = useCloudThumbnailUri(item.id);
  return (
    <Pressable style={styles.cell} onPress={onPress} accessibilityLabel={item.fileName}>
      <Image
        source={thumbnailUri ? { uri: thumbnailUri } : null}
        style={styles.cellImage}
        contentFit="cover"
        recyclingKey={item.id}
        onError={(event) => {
          if (__DEV__) console.warn(`[gallery] thumbnail failed for ${item.id}: ${event.error}`);
        }}
      />
      {item.state !== 'Ready' ? (
        <View style={[styles.stateBadge, { backgroundColor: colors.background }]}>
          {item.state === 'Failed' ? (
            <Icon name="alert-circle" size={14} color={colors.danger} />
          ) : (
            <ActivityIndicator size="small" color={colors.accent} />
          )}
        </View>
      ) : null}
      {isReadyVideo ? (
        <>
          <View style={styles.videoBadge} pointerEvents="none">
            <Icon name="play" size={13} color={colors.textInverse} />
          </View>
          {item.durationSeconds ? (
            <Text style={styles.duration}>{formatDuration(item.durationSeconds)}</Text>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

/**
 * Paginated grid of cloud-backed photos (thumbnails streamed from the
 * backend). Backs the cloud-photos screen and, in Expo Go — where the device
 * media library is off limits — the Photos tab itself.
 */
export function CloudGallery({ emptyHint, contentContainerStyle }: CloudGalleryProps) {
  const { colors } = useTheme();
  const [mediaFilter, setMediaFilter] = useState<MediaTypeFilter>('All');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState<CloudPhoto | null>(null);

  const load = useCallback(
    async (page: number, activeMedia: MediaTypeFilter, activeOrder: SortOrder) => {
      try {
        const result = await listPhotos({
          page,
          pageSize: PAGE_SIZE,
          mediaType: activeMedia === 'All' ? undefined : activeMedia,
          order: activeOrder,
        });
        setState((current) => {
          if (page === 1) {
            return { status: 'ready', items: result.items, page, totalPages: result.totalPages, loadingMore: false };
          }
          if (current.status !== 'ready') return current;
          const seen = new Set(current.items.map((item) => item.id));
          const merged = [...current.items, ...result.items.filter((item) => !seen.has(item.id))];
          return { status: 'ready', items: merged, page, totalPages: result.totalPages, loadingMore: false };
        });
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load photos.' });
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listPhotos({
      page: 1,
      pageSize: PAGE_SIZE,
      mediaType: mediaFilter === 'All' ? undefined : mediaFilter,
      order,
    })
      .then((result) => {
        if (cancelled) return;
        setState({ status: 'ready', items: result.items, page: 1, totalPages: result.totalPages, loadingMore: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load photos.' });
      });
    return () => {
      cancelled = true;
    };
  }, [mediaFilter, order]);

  // Warm the persistent caches: previews of the newest photos are prefetched
  // so opening them is instant; thumbnails cache themselves on first render.
  useEffect(() => {
    if (state.status !== 'ready' || state.page !== 1 || order !== 'desc' || mediaFilter !== 'All') return;
    void prefetchRecentPreviews(state.items).catch(() => {
      // Best-effort prefetch — the gallery still works over the network.
    });
  }, [state, mediaFilter, order]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1, mediaFilter, order);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (state.status !== 'ready' || state.loadingMore || state.page >= state.totalPages) return;
    setState({ ...state, loadingMore: true });
    void load(state.page + 1, mediaFilter, order);
  };

  const confirmDelete = (photo: CloudPhoto) => {
    haptic('medium');
    Alert.alert('Delete from cloud', `"${photo.fileName}" will be removed from your backup.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(photo.id).catch(() => Alert.alert('Delete failed', 'Try again later.'));
          void load(1, mediaFilter, order);
        },
      },
    ]);
  };

  const download = async (photo: CloudPhoto) => {
    haptic('light');
    try {
      const file = await downloadFile(photo.id, 'original');
      const { Buffer } = await import('buffer');
      const { writeAsStringAsync, documentDirectory } = await import('expo-file-system/legacy');
      const dotExt = photo.fileName.includes('.') ? photo.fileName.slice(photo.fileName.lastIndexOf('.')) : '.bin';
      const localUri = `${documentDirectory}iphotos-${photo.id}${dotExt}`;
      const base64 = Buffer.from(file).toString('base64');
      await writeAsStringAsync(localUri, base64, { encoding: 'base64' });
      try {
        await MediaLibrary.saveToLibraryAsync(localUri);
        Alert.alert('Saved', 'File saved back to your library.');
      } catch {
        // Expo Go cannot grant media access — the bytes are still in the cache.
        Alert.alert('Saved', 'File saved to the app cache directory.');
      }
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Try again later.');
    }
  };

  const openPhoto = (photo: CloudPhoto) => {
    haptic('light');
    if (photo.state === 'Ready' && photo.mediaType === 'Video') {
      setPlaying(photo);
      return;
    }
    const details = [
      photo.description,
      new Date(photo.takenAt ?? photo.createdAt).toLocaleString(),
      photo.state,
    ]
      .filter(Boolean)
      .join('\n');
    Alert.alert(photo.title || photo.fileName, details, [
      { text: 'Download original', onPress: () => void download(photo) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(photo) },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  const setFilter = (next: MediaTypeFilter | SortOrder) => {
    haptic('light');
    if (next === 'desc' || next === 'asc') setOrder(next);
    else setMediaFilter(next);
  };

  const filterHeader = (
    <View style={styles.filterRow}>
      {MEDIA_FILTERS.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => setFilter(option.value)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${option.label.toLowerCase()}`}
          accessibilityState={{ selected: mediaFilter === option.value }}
          style={({ pressed }) => [
            styles.chip,
            mediaFilter === option.value && { backgroundColor: colors.accent, borderColor: colors.accent },
            pressed && styles.chipPressed,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: mediaFilter === option.value ? colors.textInverse : colors.textSecondary },
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
      <View style={styles.sortSpacer} />
      <Pressable
        onPress={() => setFilter(order === 'desc' ? 'asc' : 'desc')}
        accessibilityRole="button"
        accessibilityLabel={order === 'desc' ? 'Sort oldest first' : 'Sort newest first'}
        style={({ pressed }) => [styles.chip, styles.sortChip, pressed && styles.chipPressed]}
      >
        <Icon name={order === 'desc' ? 'arrow-down' : 'arrow-up'} size={13} color={colors.textSecondary} />
        <Text style={[styles.chipText, { color: colors.textSecondary }]}>
          {order === 'desc' ? 'Newest' : 'Oldest'}
        </Text>
      </Pressable>
    </View>
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <ThemedText variant="bodySmall" color="danger">
          {state.message}
        </ThemedText>
        <Pressable
        onPress={() => {
          setState({ status: 'loading' });
          void load(1, mediaFilter, order);
        }}
          accessibilityLabel="Try again"
          accessibilityRole="button"
        >
          <View style={[styles.retryButton, { borderColor: colors.accent }]}>
            <ThemedText variant="bodySmall" color="accent">
              Try again
            </ThemedText>
          </View>
        </Pressable>
      </View>
    );
  }

  if (state.items.length === 0) {
    const emptyByFilter =
      mediaFilter === 'Photo'
        ? 'No photos in the cloud yet.'
        : mediaFilter === 'Video'
          ? 'No videos in the cloud yet.'
          : undefined;
    return (
      <View style={styles.center}>
        {filterHeader}
        <Icon name="cloud-offline-outline" size={40} color={colors.iconInactive} />
        <ThemedText variant="bodySmall" color="secondary" style={styles.emptyText}>
          {emptyByFilter ?? emptyHint ?? 'No photos or videos in the cloud yet — run a backup from Settings.'}
        </ThemedText>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={state.items}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={filterHeader}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={
          state.loadingMore ? <ActivityIndicator color={colors.accent} style={styles.footer} /> : null
        }
        renderItem={({ item }) => (
          <CloudPhotoCell
            item={item}
            isReadyVideo={item.state === 'Ready' && item.mediaType === 'Video'}
            colors={colors}
            onPress={() => openPhoto(item)}
          />
        )}
      />
      <CloudVideoPlayer photo={playing} onClose={() => setPlaying(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  retryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  emptyText: { textAlign: 'center' },
  cell: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  cellImage: { flex: 1, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.15)' },
  stateBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 8,
    padding: 3,
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    bottom: 4,
    left: 6,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  footer: { marginVertical: 16 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.35)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: 12, fontWeight: '600' },
  sortSpacer: { flex: 1 },
  sortChip: { alignSelf: 'flex-start' },
});
