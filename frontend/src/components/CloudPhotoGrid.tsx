import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import {
  Center,
  Cell,
  CellImage,
  FooterSpin,
  RetryButton,
  StateBadge,
} from '@/components/CloudGallery.styles';
import { Icon } from '@/components/Icon';
import type { CloudPhoto, PagedResult } from '@/data/cloud-photos-repository';
import { authHeaders } from '@/data/api-client';
import { getCachedCloudFileUri } from '@/data/cloud-media-cache';
import { fileUrl } from '@/data/cloud-photos-repository';
import type { PhotoAsset } from '@/data/types';
import { useCloudThumbnailUri } from '@/hooks/use-cloud-file';
import { useViewerStore } from '@/stores/viewer';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';
import { usePinchColumns } from '@/components/grid/usePinchColumns';

interface CloudPhotoGridProps {
  /** One page of photos for the grid (person photos, label photos…). */
  fetchPage: (page: number, pageSize: number) => Promise<PagedResult<CloudPhoto>>;
  /** Bumped by parents when the underlying set changes (rename/merge/delete). */
  refreshToken?: number;
}

type GridState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CloudPhoto[]; page: number; totalPages: number; loadingMore: boolean };

const PAGE_SIZE = 60;
/** Seed column count — the pinch gesture adjusts it from here. */
const CLOUD_COLUMNS = 3;

/** Grid cell with the same cached-thumbnail behavior as the cloud gallery. */
function GridPhotoCell({
  item,
  columns,
  onPress,
}: {
  item: CloudPhoto;
  columns: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const thumbnailUri = useCloudThumbnailUri(item.id);
  return (
    <Cell $columns={columns} onPress={onPress} accessibilityLabel={item.fileName}>
      <CellImage
        source={thumbnailUri}
        contentFit="cover"
        recyclingKey={item.id}
        transition={180}
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
    </Cell>
  );
}

/**
 * Paged grid of cloud-backed photos shared by the People and Labels screens
 * (doc 18 §10): same cached thumbnails and shared viewer as the cloud gallery,
 * without its filters/fast-scroll chrome.
 */
export function CloudPhotoGrid({ fetchPage, refreshToken = 0 }: CloudPhotoGridProps) {
  const { colors } = useTheme();
  const [state, setState] = useState<GridState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const scrollOffset = useSharedValue(0);
  const listRef = useRef<FlatList<CloudPhoto>>(null);

  // Pinch-columns (iOS Photos style): the FlatList remounts on a column
  // change (RN requirement), so the offset is scaled as a best-effort anchor.
  const restoreRef = useRef<{ offset: number; columns: number } | null>(null);
  const onStepRef = useRef<(next: number) => void>(() => {});
  const { columns, gesture: pinchGesture } = usePinchColumns(CLOUD_COLUMNS, {
    onStep: (next) => onStepRef.current(next),
  });
  useEffect(() => {
    onStepRef.current = () => {
      restoreRef.current = { offset: scrollOffset.value, columns };
    };
  }, [columns, scrollOffset]);

  const handleContentSizeChange = () => {
    const restore = restoreRef.current;
    if (!restore) return;
    restoreRef.current = null;
    listRef.current?.scrollToOffset({
      offset: Math.max(0, (restore.offset * restore.columns) / columns),
      animated: false,
    });
  };

  const load = useCallback(
    async (page: number) => {
      try {
        const result = await fetchPage(page, PAGE_SIZE);
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
    [fetchPage],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void load(1).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load, refreshToken]);

  // The viewer deletes straight from the cloud store — refresh when it closes.
  const closedAt = useViewerStore((s) => s.closedAt);
  const lastSeenClose = useRef(0);
  useEffect(() => {
    if (closedAt === 0 || closedAt === lastSeenClose.current) return;
    lastSeenClose.current = closedAt;
    if (useViewerStore.getState().context !== 'cloud') return;
    void load(1);
  }, [closedAt, load]);

  const onEndReached = () => {
    if (state.status !== 'ready' || state.loadingMore || state.page >= state.totalPages) return;
    setState({ ...state, loadingMore: true });
    void load(state.page + 1);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
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
    const photos = state.status === 'ready' ? state.items : [photo];
    const index = Math.max(0, photos.findIndex((item) => item.id === photo.id));
    useViewerStore.getState().open(photos.map(toViewerAsset), index, 'cloud');
  };

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
            void load(1);
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

  return (
    <GestureDetector gesture={pinchGesture}>
      <FlatList
        ref={listRef}
        data={state.items}
        keyExtractor={(item) => item.id}
        key={columns}
        numColumns={columns}
        onContentSizeChange={handleContentSizeChange}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={state.loadingMore ? <FooterSpin color={colors.accent} /> : null}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffset.value = e.nativeEvent.contentOffset.y;
        }}
        renderItem={({ item }) => (
          <GridPhotoCell item={item} columns={columns} onPress={() => openPhoto(item)} />
        )}
      />
    </GestureDetector>
  );
}
