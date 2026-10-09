import { useEffect, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PressableScale } from '@/components/PressableScale';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { AlbumActionSheet } from '@/components/AlbumActionSheet';
import {
  AlbumCardWrap,
  AlbumCover,
  AlbumCoverImage,
  AlbumGrid,
  AlbumTitle,
  Header,
  Screen,
  SectionHeader,
  Utilities,
  UtilityCard,
  UtilityIcon,
  UtilityMeta,
  UtilityTitle,
} from '@/screens/(tabs)/library.styles';
import { deleteAlbum } from '@/data/albums-repository';
import { fetchAssetsByIds } from '@/data/media-repository';
import { readLockedConfig } from '@/data/locked-repository';
import { useTranslation } from '@/i18n/hook';
import { confirmDialog } from '@/stores/confirm';
import { useLibraryStore } from '@/stores/library';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/** Utility card row at the top (Favorites / Locked Folder). */
function UtilityCardRow({
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
    <UtilityCard onPress={onPress}>
      <UtilityIcon>
        <Icon name={icon} size={22} color={colors.accent} />
      </UtilityIcon>
      <UtilityMeta>
        <UtilityTitle variant="body">{title}</UtilityTitle>
        <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </UtilityMeta>
      <Icon name="chevron-forward" size={18} color={colors.textDisabled} />
    </UtilityCard>
  );
}

export default function LibraryScreen() {
  const { colors, space } = useTheme();
  const { t, tCount } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const albums = useLibraryStore((s) => s.albums);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const lockedCount = useLibraryStore((s) => s.lockedIds.length);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [lockedEnabled, setLockedEnabled] = useState(false);
  const [menuAlbum, setMenuAlbum] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    setMenuAlbum({ id: albumId, title });
  };

  const handleAlbumRename = () => {
    setMenuAlbum(null);
    // RN has no built-in text prompt; renaming stays on the album screen header.
    setToast(t('albums.renameHint'));
  };

  const handleAlbumDelete = () => {
    const target = menuAlbum;
    setMenuAlbum(null);
    if (!target) return;
    void confirmDialog({
      title: t('albums.deleteConfirmTitle', { title: target.title }),
      message: t('albums.deleteConfirmBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      deleteAlbum(target.id);
      refreshLibrary();
    });
  };

  const createNewAlbum = () => {
    haptic('medium');
    // Inline creation happens through the picker sheet elsewhere; here we
    // open the picker-style flow via a simple alert on Android-compatible path.
    router.push('/album/new');
  };

  return (
    <TabSwipe tab="/library">
      <Screen
        contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[8] }}
        showsVerticalScrollIndicator={false}
      >
        <Header>
          <ThemedText variant="display">{t('tabs.library')}</ThemedText>
          <PressableScale hitSlop={8} onPress={createNewAlbum} accessibilityLabel={t('albums.create')}>
            <Icon name="add" size={26} color={colors.accent} />
          </PressableScale>
        </Header>

        <Utilities>
          <UtilityCardRow
            icon="heart"
            title={t('library.favorites')}
            subtitle={tCount('units.items', favoriteIds.length)}
            onPress={() => router.push('/album/favorites')}
          />
          <UtilityCardRow
            icon={lockedEnabled ? 'lock-closed' : 'lock-closed-outline'}
            title={t('settings.privacy.lockedFolder')}
            subtitle={lockedEnabled ? tCount('units.items', lockedCount) : t('library.lockedSetupRequired')}
            onPress={() => router.push('/locked')}
          />
        </Utilities>

        <SectionHeader>
          <ThemedText variant="label">{t('library.albums')}</ThemedText>
        </SectionHeader>

        {albums.length === 0 ? (
          <EmptyState
            icon="albums-outline"
            title={t('library.empty.title')}
            subtitle={t('library.empty.subtitle')}
          />
        ) : (
          <AlbumGrid>
            {albums.map((album, i) => {
              const cover = album.coverAssetId ? covers[album.coverAssetId] : undefined;
              return (
                <AlbumCardWrap key={album.id}>
                  <Animated.View entering={FadeInDown.delay(Math.min(i * 40, 240)).springify().dampingRatio(0.85)}>
                    <AlbumCover
                      onPress={() => {
                        haptic('light');
                        router.push(`/album/${album.id}`);
                      }}
                      onLongPress={() => showAlbumMenu(album.id, album.title)}
                    >
                      {cover ? (
                        <AlbumCoverImage source={{ uri: cover }} contentFit="cover" transition={150} />
                      ) : (
                        <Icon name="images-outline" size={26} color={colors.textSecondary} />
                      )}
                    </AlbumCover>
                    <AlbumTitle variant="bodySmall" numberOfLines={1}>
                      {album.title}
                    </AlbumTitle>
                    <ThemedText variant="bodySmall" color="secondary">
                      {tCount('units.items', album.itemCount)}
                    </ThemedText>
                  </Animated.View>
                </AlbumCardWrap>
              );
            })}
          </AlbumGrid>
        )}

        <AlbumActionSheet
          visible={menuAlbum !== null}
          albumTitle={menuAlbum?.title ?? ''}
          renameLabel={t('albums.rename')}
          deleteLabel={t('albums.delete')}
          onClose={() => setMenuAlbum(null)}
          onRename={handleAlbumRename}
          onDelete={handleAlbumDelete}
        />

        <MiniToast message={toast} onDismissed={() => setToast(null)} />
      </Screen>
    </TabSwipe>
  );
}
