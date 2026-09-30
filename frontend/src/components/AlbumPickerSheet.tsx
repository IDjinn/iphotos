import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { createAlbum } from '@/data/albums-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import type { AlbumRecord } from '@/data/types';
import { useLibraryStore } from '@/stores/library';
import { useTheme } from '@/theme/context';
import { formatCount } from '@/utils/format';
import { haptic } from '@/utils/haptics';

interface AlbumPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the album the user picked (existing or newly created). */
  onPicked: (album: AlbumRecord) => void;
}

/**
 * Bottom sheet listing albums + inline "New album" creation.
 * Covers for albums that have items are resolved lazily.
 */
export function AlbumPickerSheet({ visible, onClose, onPicked }: AlbumPickerSheetProps) {
  const { colors } = useTheme();
  const albums = useLibraryStore((s) => s.albums);
  const addAlbum = useLibraryStore((s) => s.addAlbum);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [coverCache, setCoverCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) {
      setNewTitle('');
      setCreating(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const missing = albums.filter((a) => a.coverAssetId && !coverCache[a.id]).slice(0, 12);
    if (missing.length === 0) return;
    fetchAssetsByIds(missing.map((a) => a.coverAssetId!)).then((assets) => {
      if (cancelled) return;
      setCoverCache((prev) => {
        const next = { ...prev };
        assets.forEach((asset) => {
          next[asset.id] = asset.uri;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, albums]);

  const create = () => {
    const title = newTitle.trim();
    if (!title) return;
    const album = createAlbum(title);
    addAlbum(album);
    haptic('success');
    onPicked(album);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText variant="titleMedium" style={styles.heading}>
        Add to album
      </ThemedText>

      <Pressable
        style={({ pressed }) => [styles.newRow, { backgroundColor: colors.accentSoft, opacity: pressed ? 0.8 : 1 }]}
        onPress={() => setCreating((v) => !v)}
      >
        <Icon name="add" size={22} color={colors.accent} />
        <ThemedText variant="body" color="accent" style={styles.newLabel}>
          New album
        </ThemedText>
      </Pressable>

      {creating ? (
        <View style={styles.createRow}>
          <TextInput
            autoFocus
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Album title"
            placeholderTextColor={colors.textDisabled}
            style={[styles.input, { color: colors.text, borderColor: colors.outline }]}
            onSubmitEditing={create}
            maxLength={60}
          />
          <Pressable
            onPress={create}
            disabled={!newTitle.trim()}
            style={({ pressed }) => [
              styles.createButton,
              { backgroundColor: newTitle.trim() ? colors.accent : colors.surface },
              pressed && { opacity: 0.85 },
            ]}
          >
            <ThemedText variant="body" color={newTitle.trim() ? 'inverse' : 'secondary'}>
              Create
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {albums.length === 0 && !creating ? (
          <ThemedText variant="bodySmall" color="secondary" style={styles.emptyHint}>
            No albums yet — create one above.
          </ThemedText>
        ) : null}
        {albums.map((album) => {
          const cover = album.coverAssetId ? coverCache[album.coverAssetId] : undefined;
          return (
            <Pressable
              key={album.id}
              style={({ pressed }) => [styles.albumRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                haptic('light');
                onPicked(album);
              }}
            >
              <View style={[styles.cover, { backgroundColor: colors.placeholder }]}>
                {cover ? (
                  <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Icon name="images-outline" size={20} color={colors.textSecondary} />
                )}
              </View>
              <View style={styles.albumMeta}>
                <ThemedText variant="body" numberOfLines={1}>
                  {album.title}
                </ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  {formatCount(album.itemCount, 'item', 'items')}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  newLabel: { fontWeight: '500' },
  createRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  createButton: { borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  emptyHint: { textAlign: 'center', paddingVertical: 18 },
  albumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  cover: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  albumMeta: { flex: 1 },
});
