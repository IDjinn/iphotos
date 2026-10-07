import { useEffect, useState } from 'react';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  AlbumMeta,
  AlbumRow,
  Cover,
  CoverImage,
  CreateButton,
  CreateRow,
  EmptyHint,
  Heading,
  Input,
  List,
  NewLabel,
  NewRow,
} from '@/components/AlbumPickerSheet.styles';
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
      <Heading variant="titleMedium">Add to album</Heading>

      <NewAlbumRow onPress={() => setCreating((v) => !v)} />

      {creating ? (
        <CreateRow>
          <Input
            autoFocus
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Album title"
            placeholderTextColor={colors.textDisabled}
            onSubmitEditing={create}
            maxLength={60}
          />
          <CreateButtonRow enabled={Boolean(newTitle.trim())} onPress={create} />
        </CreateRow>
      ) : null}

      <List>
        {albums.length === 0 && !creating ? (
          <EmptyHint variant="bodySmall" color="secondary">
            No albums yet — create one above.
          </EmptyHint>
        ) : null}
        {albums.map((album) => {
          const cover = album.coverAssetId ? coverCache[album.coverAssetId] : undefined;
          return (
            <AlbumRowItem key={album.id} album={album} cover={cover} onPicked={onPicked} />
          );
        })}
      </List>
    </BottomSheet>
  );
}

/** "New album" toggle row with pressed feedback. */
function NewAlbumRow({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <NewRow
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
    >
      <Icon name="add" size={22} color={colors.accent} />
      <NewLabel variant="body" color="accent">
        New album
      </NewLabel>
    </NewRow>
  );
}

function CreateButtonRow({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <CreateButton
      $enabled={enabled}
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      disabled={!enabled}
    >
      <ThemedText variant="body" color={enabled ? 'inverse' : 'secondary'}>
        Create
      </ThemedText>
    </CreateButton>
  );
}

function AlbumRowItem({
  album,
  cover,
  onPicked,
}: {
  album: AlbumRecord;
  cover?: string;
  onPicked: (album: AlbumRecord) => void;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <AlbumRow
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic('light');
        onPicked(album);
      }}
    >
      <Cover>
        {cover ? (
          <CoverImage source={{ uri: cover }} contentFit="cover" />
        ) : (
          <Icon name="images-outline" size={20} color={colors.textSecondary} />
        )}
      </Cover>
      <AlbumMeta>
        <ThemedText variant="body" numberOfLines={1}>
          {album.title}
        </ThemedText>
        <ThemedText variant="bodySmall" color="secondary">
          {formatCount(album.itemCount, 'item', 'items')}
        </ThemedText>
      </AlbumMeta>
    </AlbumRow>
  );
}
