import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useReducedMotion } from '@/animations/useReducedMotion';
import { measureHeroCell } from '@/animations/hero';
import { AlbumPickerSheet } from '@/components/AlbumPickerSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon, type IconName } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import {
  ActionRow,
  Backdrop,
  HeroImage,
  InfoLabel,
  InfoRowWrap,
  OverlayRoot,
  PagerLayer,
  SheetHeading,
} from '@/components/viewer/ViewerOverlay.styles';
import { addAssetsToAlbum, removeAssetsFromAlbum } from '@/data/albums-repository';
import { readLockedConfig } from '@/data/locked-repository';
import { deleteFromVault, exportFromVault, importToVault } from '@/data/vault-repository';
import { deletePhoto } from '@/data/cloud-photos-repository';
import { useLibraryStore } from '@/stores/library';
import { useViewerStore } from '@/stores/viewer';
import { useTheme } from '@/theme/context';
import { downloadCloudOriginal } from '@/utils/cloud-download';
import { fullDateLabel, timeLabel } from '@/utils/dates';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { deleteAssetsFromDevice, shareAssets } from '@/utils/share';

import { ViewerChrome } from './ViewerChrome';
import { ViewerPager } from './ViewerPager';
import { containFit } from './ZoomableImage';

const HERO_IN_DURATION = 300;
const HERO_OUT_DURATION = 280;

/**
 * Global photo viewer overlay: hero transition out of the pressed grid
 * cell, gesture pager, zoom, drag-to-dismiss, chrome and action sheets.
 */
export function ViewerOverlay() {
  const { colors } = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width: viewW, height: viewH } = useWindowDimensions();

  const visible = useViewerStore((s) => s.visible);
  const assets = useViewerStore((s) => s.assets);
  const index = useViewerStore((s) => s.index);
  const context = useViewerStore((s) => s.context);
  const albumId = useViewerStore((s) => s.albumId);
  const origin = useViewerStore((s) => s.origin);
  const closedAt = useViewerStore((s) => s.closedAt);
  const setAssets = useViewerStore((s) => s.setAssets);
  const setIndex = useViewerStore((s) => s.setIndex);
  const finishClose = useViewerStore((s) => s.finishClose);
  const requestClose = useViewerStore((s) => s.requestClose);

  const isFavorite = useLibraryStore((s) => (assets.length > 0 ? s.favoriteSet.has(assets[index]?.id ?? '') : false));

  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Hero flight: a static base rect plus a transform-only flight
  // (translate/scale/rotate) — animating left/top/width/height relayouts
  // every frame on Android and makes the flight stutter.
  const heroBaseX = useSharedValue(0);
  const heroBaseY = useSharedValue(0);
  const heroBaseW = useSharedValue(viewW);
  const heroBaseH = useSharedValue(viewH);
  const heroTx = useSharedValue(0);
  const heroTy = useSharedValue(0);
  const heroSx = useSharedValue(1);
  const heroSy = useSharedValue(1);
  const heroRot = useSharedValue(0);
  const heroOpacity = useSharedValue(0);
  const pagerOpacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const dismissTy = useSharedValue(0);
  const dismissScale = useSharedValue(1);
  /** The pager's own x-offset and tilt, so the close flight starts exactly
   *  where the drag released the photo. */
  const pagerOffset = useSharedValue(0);
  const pagerRotation = useSharedValue(0);

  const prevVisible = useRef(false);
  const closingRef = useRef(false);

  const current = assets[index];
  const isVideo = current?.mediaType === 'video';

  const dur = (ms: number) => (reducedMotion ? 0 : ms);

  // ---------- Open: hero flight from the pressed cell ----------
  useEffect(() => {
    if (visible && !prevVisible.current) {
      prevVisible.current = true;
      closingRef.current = false;
      setChromeVisible(true);
      setVideoPlaying(true);
      dismissTy.value = 0;
      dismissScale.value = 1;
      pagerRotation.value = 0;
      pagerOffset.value = -index * viewW;

      if (origin && !reducedMotion) {
        // Fly to the image's final "contain" frame — the exact rect the
        // pager renders — so the flight never zooms past the resting size.
        const fit = containFit(current?.width ?? 0, current?.height ?? 0, viewW, viewH);
        const targetX = (viewW - fit.w) / 2;
        const targetY = (viewH - fit.h) / 2;

        // Base = the resting rect; the flight itself is a transform from the
        // grid cell onto that rect.
        heroBaseX.value = targetX;
        heroBaseY.value = targetY;
        heroBaseW.value = fit.w;
        heroBaseH.value = fit.h;
        heroTx.value = origin.x + origin.width / 2 - (targetX + fit.w / 2);
        heroTy.value = origin.y + origin.height / 2 - (targetY + fit.h / 2);
        heroSx.value = origin.width / fit.w;
        heroSy.value = origin.height / fit.h;
        heroRot.value = 0;
        heroOpacity.value = 1;
        pagerOpacity.value = 0;
        backdropOpacity.value = 0;

        const easing = Easing.out(Easing.cubic);
        heroTx.value = withTiming(0, { duration: dur(HERO_IN_DURATION), easing });
        heroTy.value = withTiming(0, { duration: dur(HERO_IN_DURATION), easing });
        heroSx.value = withTiming(1, { duration: dur(HERO_IN_DURATION), easing });
        heroSy.value = withTiming(1, { duration: dur(HERO_IN_DURATION), easing });
        // Crossfade only once the hero has (almost) landed on the pager's frame.
        pagerOpacity.value = withDelay(dur(HERO_IN_DURATION - 80), withTiming(1, { duration: dur(180) }));
        backdropOpacity.value = withTiming(1, { duration: dur(240) });
        heroOpacity.value = withDelay(dur(HERO_IN_DURATION), withTiming(0, { duration: dur(60) }));
      } else {
        heroTx.value = 0;
        heroTy.value = 0;
        heroSx.value = 1;
        heroSy.value = 1;
        heroRot.value = 0;
        heroOpacity.value = 0;
        pagerOpacity.value = 1;
        backdropOpacity.value = 1;
      }
    }
    if (!visible) {
      prevVisible.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---------- Close: hero flight back to the (possibly moved) cell ----------
  useEffect(() => {
    if (closedAt === 0 || !visible || closingRef.current) return;
    closingRef.current = true;
    setChromeVisible(false);
    setInfoVisible(false);
    setMoreVisible(false);
    setPickerVisible(false);

    const finish = () => {
      closingRef.current = false;
      finishClose();
    };

    (async () => {
      const target = !reducedMotion && current ? await measureHeroCell(current.id) : null;
      if (target) {
        // Start from EXACTLY where the drag released the photo — the
        // contain-fit rect with the dismiss drift, scale and tilt applied —
        // so the pager→hero handoff is pixel-invisible.
        const fit = containFit(current?.width ?? 0, current?.height ?? 0, viewW, viewH);
        const startW = fit.w * dismissScale.value;
        const startH = fit.h * dismissScale.value;
        const centerX = viewW / 2 + (pagerOffset.value + index * viewW);
        const centerY = viewH / 2 + dismissTy.value;
        heroBaseX.value = centerX - startW / 2;
        heroBaseY.value = centerY - startH / 2;
        heroBaseW.value = startW;
        heroBaseH.value = startH;
        heroTx.value = 0;
        heroTy.value = 0;
        heroSx.value = 1;
        heroSy.value = 1;
        heroRot.value = pagerRotation.value;
        heroOpacity.value = 1;

        pagerOpacity.value = withTiming(0, { duration: dur(140) });
        backdropOpacity.value = withTiming(0, { duration: dur(220) });

        const easing = Easing.in(Easing.cubic);
        heroTx.value = withTiming(target.x + target.width / 2 - centerX, {
          duration: dur(HERO_OUT_DURATION),
          easing,
        });
        heroTy.value = withTiming(target.y + target.height / 2 - centerY, {
          duration: dur(HERO_OUT_DURATION),
          easing,
        });
        heroSx.value = withTiming(target.width / startW, { duration: dur(HERO_OUT_DURATION), easing });
        heroSy.value = withTiming(target.height / startH, { duration: dur(HERO_OUT_DURATION), easing });
        heroRot.value = withTiming(0, { duration: dur(HERO_OUT_DURATION), easing });
        heroOpacity.value = withDelay(dur(HERO_OUT_DURATION), withTiming(0, { duration: dur(40) }));

        setTimeout(finish, dur(HERO_OUT_DURATION) + 60);
      } else {
        heroTx.value = 0;
        heroTy.value = 0;
        heroSx.value = 1;
        heroSy.value = 1;
        heroRot.value = 0;
        pagerOpacity.value = withTiming(0, { duration: dur(180) });
        backdropOpacity.value = withTiming(0, { duration: dur(180) });
        heroOpacity.value = 0;
        setTimeout(finish, dur(200) + 40);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedAt]);

  // Android back closes the viewer.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, requestClose]);

  // ---------- Actions on the current asset ----------
  const removeCurrentFromList = (message: string) => {
    const next = assets.filter((a) => a.id !== current.id);
    setAssets(next);
    if (next.length === 0) {
      requestClose();
    } else {
      setIndex(Math.min(index, next.length - 1));
      setToast(message);
    }
  };

  const handleShare = () => {
    if (context === 'cloud') return;
    if (current) void shareAssets([current]);
  };

  const handleDownload = () => {
    if (!current) return;
    haptic('light');
    void downloadCloudOriginal({ id: current.id, fileName: current.filename })
      .then((message) => setToast(message))
      .catch(() => setToast('Download failed — try again later'));
  };

  const handleFavorite = () => {
    if (!current || context === 'cloud') return;
    const wasFavorite = useLibraryStore.getState().favoriteSet.has(current.id);
    useLibraryStore.getState().toggleFavorite(current.id);
    setToast(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
  };

  const handleDelete = () => {
    if (!current) return;
    if (context === 'cloud') {
      Alert.alert('Delete from cloud?', 'This photo will be removed from your backup on all devices.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic('warning');
            void deletePhoto(current.id)
              .then(() => removeCurrentFromList('Deleted from cloud'))
              .catch(() => setToast('Delete failed — try again later'));
          },
        },
      ]);
      return;
    }
    if (context === 'locked' && current.vaultId) {
      Alert.alert(
        'Delete from Locked Folder?',
        'The encrypted copy will be permanently deleted.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              haptic('warning');
              deleteFromVault([current.vaultId!]);
              removeCurrentFromList('Deleted');
            },
          },
        ]
      );
      return;
    }
    Alert.alert(
      'Delete from device?',
      isVideo ? 'This video will be permanently deleted.' : 'This photo will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptic('warning');
            const ok = await deleteAssetsFromDevice([current.id]);
            if (ok) {
              useLibraryStore.getState().purge([current.id]);
              removeCurrentFromList('Deleted');
            }
          },
        },
      ]
    );
  };

  const handleLockToggle = async () => {
    if (!current) return;
    if (context === 'locked') {
      if (current.vaultId) {
        const { exported } = await exportFromVault([current.vaultId]);
        if (exported > 0) removeCurrentFromList('Unlocked — back in your gallery');
        else setToast('Could not unlock — try again');
      } else {
        useLibraryStore.getState().unlockMany([current.id]);
        removeCurrentFromList('Unlocked — back in your gallery');
      }
      return;
    }
    const config = await readLockedConfig();
    if (!config.enabled) {
      setToast('Set up your Locked Folder first');
      setMoreVisible(false);
      router.push('/locked');
      return;
    }
    Alert.alert(
      'Move to Locked Folder?',
      'This item will be removed from your device gallery and stored encrypted inside iPhotos.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: () => {
            void importToVault([current]).then(({ imported }) => {
              if (imported > 0) removeCurrentFromList('Moved to Locked Folder');
              else setToast('Could not move — try again');
            });
          },
        },
      ]
    );
  };

  const handleRemoveFromAlbum = () => {
    if (!current || !albumId) return;
    removeAssetsFromAlbum(albumId, [current.id]);
    useLibraryStore.getState().refresh();
    removeCurrentFromList('Removed from album');
  };

  const handleAddToAlbum = (albumIdPicked: string) => {
    if (!current) return;
    const added = addAssetsToAlbum(albumIdPicked, [current.id]);
    useLibraryStore.getState().refresh();
    setPickerVisible(false);
    setToast(added > 0 ? 'Added to album' : 'Already in that album');
  };

  const toggleChrome = () => setChromeVisible((v) => !v);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const pagerStyle = useAnimatedStyle(() => ({ opacity: pagerOpacity.value }));
  const heroStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: heroBaseX.value,
    top: heroBaseY.value,
    width: heroBaseW.value,
    height: heroBaseH.value,
    opacity: heroOpacity.value,
    overflow: 'hidden',
    transform: [
      { translateX: heroTx.value },
      { translateY: heroTy.value },
      { rotate: `${heroRot.value}deg` },
      { scaleX: heroSx.value },
      { scaleY: heroSy.value },
    ],
  }));

  if (!visible || assets.length === 0 || !current) {
    return null;
  }

  const moreActions: Array<{ icon: IconName; label: string; action: () => void; destructive?: boolean }> = [
    { icon: 'images-outline', label: 'Add to album', action: () => setPickerVisible(true) },
    {
      icon: context === 'locked' ? 'lock-open-outline' : 'lock-closed-outline',
      label: context === 'locked' ? 'Unlock from Locked Folder' : 'Move to Locked Folder',
      action: handleLockToggle,
    },
  ];
  if (context === 'album') {
    moreActions.push({ icon: 'remove-circle-outline', label: 'Remove from album', action: handleRemoveFromAlbum });
  }

  return (
    <OverlayRoot pointerEvents="box-none">
      <StatusBar style="light" />

      <Backdrop style={backdropStyle} />

      <PagerLayer style={pagerStyle} pointerEvents="auto">
        <ViewerPager
          assets={assets}
          index={index}
          onIndexChange={setIndex}
          onDismiss={requestClose}
          onTap={toggleChrome}
          dismissTy={dismissTy}
          dismissScale={dismissScale}
          backdropOpacity={backdropOpacity}
          offset={pagerOffset}
          rotation={pagerRotation}
          videoPlaying={videoPlaying}
          videoMuted={videoMuted}
        />
      </PagerLayer>

      <Animated.View style={heroStyle} pointerEvents="none">
        {/* "contain" — the flight must show the whole photo, never a screen-fill crop. */}
        <HeroImage source={{ uri: current.uri, headers: current.sourceHeaders }} contentFit="contain" transition={0} />
      </Animated.View>

      <ViewerChrome
        visible={chromeVisible && !infoVisible && !moreVisible && !pickerVisible}
        title={fullDateLabel(current.creationTime)}
        isVideo={isVideo}
        isFavorite={isFavorite}
        playing={videoPlaying}
        muted={videoMuted}
        favoriteKey={0}
        variant={context === 'cloud' ? 'cloud' : 'device'}
        onClose={requestClose}
        onInfo={() => setInfoVisible(true)}
        onShare={handleShare}
        onToggleFavorite={handleFavorite}
        onDelete={handleDelete}
        onDownload={handleDownload}
        onMore={() => setMoreVisible(true)}
        onTogglePlay={() => setVideoPlaying((v) => !v)}
        onToggleMute={() => setVideoMuted((v) => !v)}
      />

      {/* Details sheet */}
      <BottomSheet visible={infoVisible} onClose={() => setInfoVisible(false)} maxHeightFactor={0.6}>
        <SheetHeading variant="titleMedium">Details</SheetHeading>
        <InfoRow label="File name" value={current.filename || '—'} />
        <InfoRow label="Date" value={`${fullDateLabel(current.creationTime)} · ${timeLabel(current.creationTime)}`} />
        <InfoRow
          label="Type"
          value={isVideo ? `Video${current.duration ? ` · ${formatDuration(current.duration)}` : ''}` : 'Photo'}
        />
        <InfoRow label="Dimensions" value={current.width > 0 ? `${current.width} × ${current.height}` : '—'} />
        <InfoRow
          label="Storage"
          value={
            context === 'cloud'
              ? 'Cloud backup'
              : current.vaultId
                ? 'Encrypted in the Locked Folder'
                : 'On device · cloud backup arrives in phase 2'
          }
        />
      </BottomSheet>

      {/* More-actions sheet */}
      <BottomSheet visible={moreVisible} onClose={() => setMoreVisible(false)} maxHeightFactor={0.45}>
        <SheetHeading variant="titleMedium">Actions</SheetHeading>
        {moreActions.map((entry) => (
          <ActionRowItem key={entry.label} entry={entry} onDone={() => setMoreVisible(false)} />
        ))}
      </BottomSheet>

      <AlbumPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPicked={(album) => handleAddToAlbum(album.id)}
      />

      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </OverlayRoot>
  );
}

function ActionRowItem({
  entry,
  onDone,
}: {
  entry: { icon: IconName; label: string; action: () => void; destructive?: boolean };
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <ActionRow
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        onDone();
        entry.action();
      }}
    >
      <Icon name={entry.icon} size={22} color={entry.destructive ? colors.danger : colors.icon} />
      <ThemedText variant="body" color={entry.destructive ? 'danger' : 'primary'}>
        {entry.label}
      </ThemedText>
    </ActionRow>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <InfoRowWrap>
      <InfoLabel variant="bodySmall" color="secondary">
        {label}
      </InfoLabel>
      <ThemedText variant="body">
        {value}
      </ThemedText>
    </InfoRowWrap>
  );
}
