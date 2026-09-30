import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { authHeaders } from '@/data/api-client';
import {
  deletePhoto,
  downloadFile,
  fileUrl,
  listPhotos,
  type CloudPhoto,
} from '@/data/cloud-photos-repository';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const PAGE_SIZE = 60;

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CloudPhoto[]; page: number; totalPages: number; loadingMore: boolean };

export default function CloudPhotosScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (page: number) => {
    try {
      const result = await listPhotos(page, PAGE_SIZE);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPhotos(1, PAGE_SIZE)
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
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (state.status !== 'ready' || state.loadingMore || state.page >= state.totalPages) return;
    setState({ ...state, loadingMore: true });
    void load(state.page + 1);
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
          void load(1);
        },
      },
    ]);
  };

  const download = async (photo: CloudPhoto) => {
    haptic('light');
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to save downloads.');
        return;
      }
      const file = await downloadFile(photo.id, 'original');
      const { Buffer } = await import('buffer');
      const { writeAsStringAsync, documentDirectory } = await import('expo-file-system/legacy');
      const base64 = Buffer.from(file).toString('base64');
      const localUri = `${documentDirectory}iphotos-${photo.id}.${photo.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      await writeAsStringAsync(localUri, base64, { encoding: 'base64' });
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Photo saved back to your library.');
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Try again later.');
    }
  };

  const openPhoto = (photo: CloudPhoto) => {
    haptic('light');
    Alert.alert(photo.fileName, `${new Date(photo.createdAt).toLocaleString()}\n${photo.state}`, [
      { text: 'Download original', onPress: () => void download(photo) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(photo) },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          Photos in the cloud
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <ThemedText variant="bodySmall" color="danger">
            {state.message}
          </ThemedText>
        </View>
      ) : state.items.length === 0 ? (
        <View style={styles.center}>
          <Icon name="cloud-offline-outline" size={40} color={colors.iconInactive} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.emptyText}>
            No photos in the cloud yet — run a backup from Settings.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={state.items}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListFooterComponent={
            state.loadingMore ? <ActivityIndicator color={colors.accent} style={styles.footer} /> : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.cell} onPress={() => openPhoto(item)} accessibilityLabel={item.fileName}>
              <Image
                source={{ uri: fileUrl(item.id, 'thumbnail'), headers: authHeaders() }}
                style={styles.cellImage}
                contentFit="cover"
                recyclingKey={item.id}
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
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
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
  footer: { marginVertical: 16 },
});
