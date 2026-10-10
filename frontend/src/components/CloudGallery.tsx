import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { CloudVideoPlayer } from '@/components/CloudVideoPlayer';
import { FastScroll, type FastScrollHandle } from '@/components/grid/FastScroll';
import {
  Cell,
  CellImage,
  Center,
  Chip,
  ChipText,
  Duration,
  EmptyText,
  FilterRow,
  FooterSpin,
  RetryButton,
  SortSpacer,
  StateBadge,
  MediaBadge,
} from '@/components/CloudGallery.styles';
import { prefetchRecentPreviews, getCachedCloudFileUri } from '@/data/cloud-media-cache';
import {
  fileUrl,
  getUsage,
  listPhotoMonths,
  listPhotos,
  type CloudMediaType,
  type CloudPhoto,
  type PhotoMonthBucket,
} from '@/data/cloud-photos-repository';
import type { GridLayoutMetrics } from '@/data/grid-metrics';
import { authHeaders } from '@/data/api-client';
import type { PhotoAsset } from '@/data/types';
import { useCloudThumbnailUri } from '@/hooks/use-cloud-file';
import { useViewerStore } from '@/stores/viewer';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { monthBucketLabel, monthEndIso, monthStartIso } from '@/utils/dates';
import { formatDuration } from '@/utils/format';

const PAGE_SIZE = 60;

type MediaTypeFilter = 'All' | 'Photo' | 'Video' | 'Live';
type SortOrder = 'desc' | 'asc';

const MEDIA_FILTERS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Photo', label: 'Photos' },
  { value: 'Video', label: 'Videos' },
];

/** Live photos are photos — the Live chip narrows by the isLive flag, not mediaType. */
function filterParams(filter: MediaTypeFilter): { mediaType?: CloudMediaType; isLive?: boolean } {
  if (filter === 'Live') return { isLive: true };
  return filter === 'All' ? {} : { mediaType: filter };
}

/** The Live chip only pays for itself once the library has more than one live photo. */
const LIVE_FILTER_MIN_COUNT = 2;

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CloudPhoto[]; page: number; totalPages: number; loadingMore: boolean };

interface CloudGalleryProps {
  /** Shown instead of the default "run a backup" hint when the cloud is empty. */
  emptyHint?: string;
  contentContainerStyle?: { paddingBottom: number };
}

/** Filter/sort pill with pressed feedback. */
function FilterChip({
  label,
  selected,
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  icon?: { name: 'arrow-down' | 'arrow-up' };
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Chip
      $selected={selected}
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={icon ? (selected ? 'Sort oldest first' : 'Sort newest first') : `Show ${label.toLowerCase()}`}
      accessibilityState={{ selected }}
    >
      {icon ? <SortIcon active={selected} direction={icon.name} /> : null}
      <ChipText $selected={selected}>{label}</ChipText>
    </Chip>
  );
}

function SortIcon({ direction }: { active: boolean; direction: 'arrow-down' | 'arrow-up' }) {
  const { colors } = useTheme();
  return <Icon name={direction} size={13} color={colors.textSecondary} />;
}

/** Grid cell rendering the cached thumbnail, downloading it on first view. */
function CloudPhotoCell({ item, isReadyVideo, onPress }: { item: CloudPhoto; isReadyVideo: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const thumbnailUri = useCloudThumbnailUri(item.id);
  return (
    <Cell onPress={onPress} accessibilityLabel={item.fileName}>
      <CellImage
        source={thumbnailUri}
        contentFit="cover"
        recyclingKey={item.id}
        onError={(event) => {
          if (__DEV__) console.warn(`[gallery] thumbnail failed for ${item.id}: ${event.error}`);
        }}
      />
      {item.state !== 'Ready' ? (
        <StateBadge>
          {item.state === 'Failed' ? (
            <Icon name="alert-circle" size={14} color={colors.danger} />
          ) : (
            <ActivityIndicator size="small" color={colors.accent} />
          )}
        </StateBadge>
      ) : null}
      {isReadyVideo ? (
        <>
          <MediaBadge pointerEvents="none">
            <Icon name="play" size={13} color={colors.textInverse} />
          </MediaBadge>
          {item.durationSeconds ? (
            <Duration>{formatDuration(item.durationSeconds)}</Duration>
          ) : null}
        </>
      ) : item.state === 'Ready' && item.isLive ? (
        <MediaBadge pointerEvents="none">
          <Icon name="radio-button-on" size={13} color={colors.textInverse} />
        </MediaBadge>
      ) : null}
    </Cell>
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
  const [months, setMonths] = useState<PhotoMonthBucket[] | null>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [livePhotoCount, setLivePhotoCount] = useState(0);
  const listRef = useRef<FlatList<CloudPhoto>>(null);
  const fastScrollRef = useRef<FastScrollHandle>(null);
  const scrollOffset = useSharedValue(0);

  /** Live total from the usage endpoint — gates the Live chip (best-effort). */
  const refreshLiveCount = useCallback(() => {
    getUsage()
      .then((usage) => setLivePhotoCount(usage.livePhotoCount))
      .catch(() => setLivePhotoCount(0));
  }, []);

  useEffect(refreshLiveCount, [refreshLiveCount]);

  /** Month buckets for the fast-scroll jump targets — display order follows `order`. */
  const fetchMonths = useCallback((activeMedia: MediaTypeFilter, activeOrder: SortOrder) => {
    listPhotoMonths({ ...filterParams(activeMedia) })
      .then((buckets) => setMonths(activeOrder === 'desc' ? buckets : [...buckets].reverse()))
      .catch(() => setMonths(null));
  }, []);

  const load = useCallback(
    async (page: number, activeMedia: MediaTypeFilter, activeOrder: SortOrder) => {
      try {
        const result = await listPhotos({
          page,
          pageSize: PAGE_SIZE,
          ...filterParams(activeMedia),
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
    fetchMonths(mediaFilter, order);
    listPhotos({
      page: 1,
      pageSize: PAGE_SIZE,
      ...filterParams(mediaFilter),
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
  }, [mediaFilter, order, fetchMonths]);

  // Warm the persistent caches: previews of the newest photos are prefetched
  // so opening them is instant; thumbnails cache themselves on first render.
  useEffect(() => {
    if (state.status !== 'ready' || state.page !== 1 || order !== 'desc' || mediaFilter !== 'All') return;
    void prefetchRecentPreviews(state.items).catch(() => {
      // Best-effort prefetch — the gallery still works over the network.
    });
  }, [state, mediaFilter, order]);

  // The viewer deletes straight from the cloud store — refresh when it closes.
  const closedAt = useViewerStore((s) => s.closedAt);
  const lastSeenClose = useRef(0);
  useEffect(() => {
    if (closedAt === 0 || closedAt === lastSeenClose.current) return;
    lastSeenClose.current = closedAt;
    if (useViewerStore.getState().context !== 'cloud') return;
    refreshLiveCount();
    fetchMonths(mediaFilter, order);
    void load(1, mediaFilter, order);
  }, [closedAt, load, fetchMonths, refreshLiveCount, mediaFilter, order]);

  const onRefresh = async () => {
    setRefreshing(true);
    refreshLiveCount();
    fetchMonths(mediaFilter, order);
    await load(1, mediaFilter, order);
    setRefreshing(false);
  };

  /**
   * Rebases the loaded window onto a month: page 1 starting at that month
   * (desc = newest ≤ month end; asc = oldest ≥ month start). Undated photos
   * ride the ends of the timeline — scroll to them without a refetch.
   */
  const jumpToMonth = async (month: string) => {
    if (month === '') {
      if (order === 'asc') void load(1, mediaFilter, order);
      else listRef.current?.scrollToEnd({ animated: true });
      return;
    }
    const range = order === 'desc' ? { to: monthEndIso(month) } : { from: monthStartIso(month) };
    try {
      const result = await listPhotos({
        page: 1,
        pageSize: PAGE_SIZE,
        ...filterParams(mediaFilter),
        order,
        ...range,
      });
      if (result.items.length === 0) {
        void load(1, mediaFilter, order);
        return;
      }
      setState({ status: 'ready', items: result.items, page: 1, totalPages: result.totalPages, loadingMore: false });
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {
      // The rail is a shortcut — keep the current window on failure.
    }
  };

  /**
   * Fast-scroll metrics on the FULL timeline scale (from the month buckets),
   * so the rail covers months that aren't loaded yet: scrubbing inside the
   * loaded window scrolls live, above it previews and a release jumps.
   */
  const railMetrics = useMemo<GridLayoutMetrics | null>(() => {
    if (!months || months.length === 0 || layout.width <= 0 || layout.height <= 0) return null;
    const rowHeight = layout.width / 3; // Cell is a 1/3-width square.
    const totalPhotos = months.reduce((sum, bucket) => sum + bucket.count, 0);
    const markers: GridLayoutMetrics['months'] = [];
    let cum = 0;
    for (const bucket of months) {
      markers.push({
        itemIndex: cum,
        offset: headerHeight + Math.floor(cum / 3) * rowHeight,
        key: `m-${bucket.month}`,
        label: monthBucketLabel(bucket.month),
      });
      cum += bucket.count;
    }
    return {
      offsets: [],
      contentHeight: headerHeight + Math.ceil(totalPhotos / 3) * rowHeight,
      months: markers,
    };
  }, [months, layout, headerHeight]);

  /** Timeline Y of the loaded window's top (its first item's month start). */
  const windowOffset = useMemo(() => {
    if (state.status !== 'ready' || state.items.length === 0 || !months || layout.width <= 0) return 0;
    const first = state.items[0];
    const key = first.takenAt ? first.takenAt.slice(0, 7) : '';
    const rowHeight = layout.width / 3;
    let cum = 0;
    for (const bucket of months) {
      if (bucket.month === key) break;
      cum += bucket.count;
    }
    return headerHeight + Math.floor(cum / 3) * rowHeight;
  }, [state, months, layout.width, headerHeight]);

  /** Loaded content height on the timeline scale. */
  const loadedHeight = useMemo(() => {
    if (state.status !== 'ready' || layout.width <= 0) return 0;
    const rowHeight = layout.width / 3;
    return headerHeight + Math.ceil(state.items.length / 3) * rowHeight;
  }, [state, layout.width, headerHeight]);

  const handleListLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout((current) =>
      current.width === width && current.height === height ? current : { width, height });
  }, []);

  const onEndReached = () => {
    if (state.status !== 'ready' || state.loadingMore || state.page >= state.totalPages) return;
    setState({ ...state, loadingMore: true });
    void load(state.page + 1, mediaFilter, order);
  };

  /** Maps a cloud photo to the shared viewer asset, preferring the cached preview. */
  const toViewerAsset = (photo: CloudPhoto): PhotoAsset => ({
    id: photo.id,
    uri: getCachedCloudFileUri(photo.id, 'preview') ?? fileUrl(photo.id, 'preview'),
    filename: photo.title || photo.fileName,
    mediaType: 'photo',
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    creationTime: new Date(photo.takenAt ?? photo.createdAt).getTime(),
    modificationTime: new Date(photo.createdAt).getTime(),
    // Harmless on cached local files, required on the authenticated remote fallback.
    sourceHeaders: authHeaders(),
  });

  const openPhoto = (photo: CloudPhoto) => {
    haptic('light');
    if (photo.state === 'Ready' && photo.mediaType === 'Video') {
      setPlaying(photo);
      return;
    }
    const photos = state.status === 'ready' ? state.items.filter((item) => item.mediaType !== 'Video') : [];
    const list = photos.length > 0 ? photos : [photo];
    const index = Math.max(0, list.findIndex((item) => item.id === photo.id));
    useViewerStore.getState().open(list.map(toViewerAsset), index, 'cloud');
  };

  const setFilter = (next: MediaTypeFilter | SortOrder) => {
    haptic('light');
    if (next === 'desc' || next === 'asc') setOrder(next);
    else setMediaFilter(next);
  };

  const filterHeader = (
    <FilterRow
      onLayout={(e) => {
        const height = e.nativeEvent.layout.height;
        setHeaderHeight((current) => (current === height ? current : height));
      }}
    >
      {MEDIA_FILTERS.map((option) => (
        <FilterChip
          key={option.value}
          label={option.label}
          selected={mediaFilter === option.value}
          onPress={() => setFilter(option.value)}
        />
      ))}
      {livePhotoCount >= LIVE_FILTER_MIN_COUNT ? (
        <FilterChip
          label="Live"
          selected={mediaFilter === 'Live'}
          onPress={() => setFilter('Live')}
        />
      ) : null}
      <SortSpacer />
      <FilterChip
        label={order === 'desc' ? 'Newest' : 'Oldest'}
        selected={false}
        icon={{ name: order === 'desc' ? 'arrow-down' : 'arrow-up' }}
        onPress={() => setFilter(order === 'desc' ? 'asc' : 'desc')}
      />
    </FilterRow>
  );

  if (state.status === 'loading') {
    return (
      <Center>
        <ActivityIndicator color={colors.accent} />
      </Center>
    );
  }

  if (state.status === 'error') {
    return (
      <Center>
        <ThemedText variant="bodySmall" color="danger">
          {state.message}
        </ThemedText>
        <RetryButton
          onPress={() => {
            setState({ status: 'loading' });
            void load(1, mediaFilter, order);
          }}
          accessibilityLabel="Try again"
          accessibilityRole="button"
        >
          <ThemedText variant="bodySmall" color="accent">
            Try again
          </ThemedText>
        </RetryButton>
      </Center>
    );
  }

  if (state.items.length === 0) {
    const emptyByFilter =
      mediaFilter === 'Photo'
        ? 'No photos in the cloud yet.'
        : mediaFilter === 'Video'
          ? 'No videos in the cloud yet.'
          : mediaFilter === 'Live'
            ? 'No live photos in the cloud yet.'
            : undefined;
    return (
      <Center>
        {filterHeader}
        <Icon name="cloud-offline-outline" size={40} color={colors.iconInactive} />
        <EmptyText variant="bodySmall" color="secondary">
          {emptyByFilter ?? emptyHint ?? 'No photos or videos in the cloud yet — run a backup from Settings.'}
        </EmptyText>
      </Center>
    );
  }

  return (
    <>
      <FlatList
        ref={listRef}
        data={state.items}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={filterHeader}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={state.loadingMore ? <FooterSpin color={colors.accent} /> : null}
        onLayout={handleListLayout}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffset.value = e.nativeEvent.contentOffset.y;
          fastScrollRef.current?.reveal();
        }}
        renderItem={({ item }) => (
          <CloudPhotoCell
            item={item}
            isReadyVideo={item.state === 'Ready' && item.mediaType === 'Video'}
            onPress={() => openPhoto(item)}
          />
        )}
      />
      {railMetrics ? (
        <FastScroll
          ref={fastScrollRef}
          metrics={railMetrics}
          viewportHeight={layout.height}
          scrollOffset={scrollOffset}
          scrollToOffset={(offset, animated) => listRef.current?.scrollToOffset({ offset, animated })}
          windowOffset={windowOffset}
          windowHeight={loadedHeight}
          onJumpToMonth={(index) => {
            const bucket = months?.[index];
            if (bucket) void jumpToMonth(bucket.month);
          }}
        />
      ) : null}
      <CloudVideoPlayer photo={playing} onClose={() => setPlaying(null)} />
    </>
  );
}
