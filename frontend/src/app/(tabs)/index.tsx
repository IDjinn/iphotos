import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { CloudGallery } from '@/components/CloudGallery';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PermissionGate } from '@/components/PermissionGate';
import { SelectionBar } from '@/components/SelectionBar';
import { AlbumPickerSheet } from '@/components/AlbumPickerSheet';
import { TabSwipe } from '@/components/TabSwipe';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import {
  BannerText,
  Center,
  ExpoGoBanner,
  Header,
  HeaderTitle,
  Screen,
} from '@/screens/(tabs)/index.styles';
import { useBulkActions, BULK_TOAST, type BulkToast } from '@/hooks/use-bulk-actions';
import { useGalleryFeed } from '@/hooks/use-gallery-feed';
import { useTranslation } from '@/i18n/hook';
import { useSelectionStore } from '@/stores/selection';
import { useTheme } from '@/theme/context';

/**
 * Photos tab: the main timeline grid with month/day sections,
 * selection mode and all bulk actions.
 */
export default function PhotosScreen() {
  const { colors, space } = useTheme();
  const { t, tCount } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assets, permission, loading, refreshing, loadMore, refresh, askPermission } = useGalleryFeed();

  const selectionActive = useSelectionStore((s) => s.active);
  const selectedCount = useSelectionStore((s) => s.ids.length);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [toast, setToast] = useState<BulkToast | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const shownAssets = useMemo(() => assets.filter((a) => !removedIds.has(a.id)), [assets, removedIds]);

  const bulk = useBulkActions({
    assets,
    applyRemovals: (ids) => setRemovedIds((prev) => new Set([...prev, ...ids])),
  });

  const handleLock = async () => {
    const result = await bulk.toggleLocked();
    if (!result) return;
    setToast(result);
    if (result.key === BULK_TOAST.SETUP_REQUIRED) router.push('/locked');
  };

  const handleDelete = () => {
    Alert.alert(
      tCount('photos.deleteCountTitle', selectedCount, { count: selectedCount.toLocaleString() }),
      t('photos.deleteWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void bulk.remove().then((ok) => {
              if (!ok) setToast({ key: 'photos.deleteFailed' });
              else setRemovedIds(new Set());
            });
          },
        },
      ]
    );
  };

  if (permission === 'unknown' || (loading && assets.length === 0 && removedIds.size === 0)) {
    return (
      <Center $insetTop={insets.top}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Center>
    );
  }

  if (permission === 'unavailable') {
    return (
      <TabSwipe tab="/">
        <Screen $insetTop={insets.top}>
          <Header>
            <ThemedText variant="display">iPhotos</ThemedText>
            <Pressable hitSlop={12} onPress={() => router.push('/settings')} accessibilityLabel={t('settings.title')}>
              <Icon name="settings-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </Header>
          <ExpoGoBanner
            onPress={() => router.push('/settings/import-zip')}
            accessibilityLabel={t('settings.importZip.title')}
          >
            <Icon name="cloud-outline" size={16} color={colors.accent} />
            <BannerText variant="bodySmall" color="secondary">
              {t('photos.expoGoBanner')}
            </BannerText>
            <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
          </ExpoGoBanner>
          <CloudGallery contentContainerStyle={{ paddingBottom: insets.bottom + space[6] }} />
        </Screen>
      </TabSwipe>
    );
  }

  if (permission === 'denied' || permission === 'limited') {
    return (
      <Screen $insetTop={insets.top}>
        <PermissionGate status={permission} onRequest={askPermission} />
      </Screen>
    );
  }

  if (shownAssets.length === 0) {
    return (
      <Screen $insetTop={insets.top}>
        <Header>
          <ThemedText variant="display">iPhotos</ThemedText>
        </Header>
        <EmptyState
          icon="images-outline"
          title={t('photos.empty.title')}
          subtitle={t('photos.empty.subtitle')}
        />
      </Screen>
    );
  }

  return (
    <TabSwipe tab="/">
      <Screen $insetTop={insets.top}>
        {/* Header — crossfades between normal and selection mode. */}
        {selectionActive ? (
          <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            <Pressable hitSlop={12} onPress={() => useSelectionStore.getState().end()} accessibilityLabel={t('selection.exit')}>
              <Icon name="close" size={24} />
            </Pressable>
            <HeaderTitle variant="titleMedium">{tCount('selection.count', selectedCount, { count: selectedCount.toLocaleString() })}</HeaderTitle>
            <Pressable
              hitSlop={12}
              onPress={() => useSelectionStore.getState().selectMany(shownAssets.map((a) => a.id))}
              accessibilityLabel={t('selection.selectAll')}
            >
              <Icon name="checkmark-circle-outline" size={24} />
            </Pressable>
          </Header>
        ) : (
          <Header entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            <ThemedText variant="display">iPhotos</ThemedText>
            <Pressable hitSlop={12} onPress={() => router.push('/settings')} accessibilityLabel={t('settings.title')}>
              <Icon name="settings-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </Header>
        )}

        <PhotoGrid
          assets={shownAssets}
          context="gallery"
          onRefresh={() => {
            setRemovedIds(new Set());
            return refresh();
          }}
          refreshing={refreshing}
          onEndReached={() => void loadMore()}
        />

        {selectionActive ? (
          <SelectionBar
            count={selectedCount}
            onExit={() => useSelectionStore.getState().end()}
            actions={[
              { icon: 'share-outline', label: t('common.share'), onPress: () => void bulk.share() },
              { icon: 'heart-outline', label: t('selection.favorite'), onPress: bulk.favorite },
              { icon: 'images-outline', label: t('selection.addToAlbum'), onPress: () => setPickerVisible(true) },
              { icon: 'lock-closed-outline', label: t('selection.lock'), onPress: () => void handleLock() },
              { icon: 'trash-outline', label: t('common.delete'), onPress: handleDelete, destructive: true },
            ]}
          />
        ) : null}

        <AlbumPickerSheet
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onPicked={(album) => {
            const added = bulk.addToAlbum(album.id);
            setToast(
              added > 0
                ? { key: 'photos.addedToAlbum', params: { album: album.title } }
                : { key: 'photos.alreadyInAlbum' }
            );
          }}
        />

        <MiniToast message={toast ? t(toast.key, toast.params) : null} onDismissed={() => setToast(null)} />
      </Screen>
    </TabSwipe>
  );
}
