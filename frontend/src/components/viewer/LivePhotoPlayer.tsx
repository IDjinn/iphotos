import { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { ZoomableImage, type ViewerDismissDrivers, type ZoomController } from '@/components/viewer/ZoomableImage';
import {
  LivePageWrap,
  LivePill,
  LiveSurface,
  PillText,
  PillWrap,
} from '@/components/viewer/LivePhotoPlayer.styles';
import type { PhotoAsset } from '@/data/types';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface LivePhotoPlayerProps {
  asset: PhotoAsset;
  /** Whether this page is the active (center) page. */
  active: boolean;
  /** The pager's pan gesture, simultaneous with the hold-to-play long press. */
  pagerPan: GestureType;
  controller: ZoomController;
  dismiss: ViewerDismissDrivers | null;
  onTap: () => void;
}

/**
 * Live Photo page (cloud assets with a stored motion clip): the still renders
 * as usual, press-and-hold plays the paired clip (release returns to the key
 * frame), and the LIVE chip toggles playback for accessibility — the iOS
 * Photos interaction, mapped to Android.
 */
export function LivePhotoPlayer({
  asset,
  active,
  pagerPan,
  controller,
  dismiss,
  onTap,
}: LivePhotoPlayerProps) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(false);
  const holdRef = useRef(false);

  // Remote source with auth headers — the clip is small (~3 s), so streaming
  // starts fast and no cache-file hop is needed.
  const source = useMemo(
    () =>
      asset.motionUri
        ? { uri: asset.motionUri, headers: asset.sourceHeaders }
        : null,
    [asset.motionUri, asset.sourceHeaders],
  );
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = false;
  });

  useEffect(() => {
    if (!active) {
      if (playing) setPlaying(false);
      return;
    }
    if (playing) {
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
    }
  }, [playing, active, player]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      player.currentTime = 0;
      setPlaying(false);
    });
    return () => sub.remove();
  }, [player]);

  // Press-and-hold on the photo plays; release (or cancel) returns to the still.
  const longPress = useMemo(() => {
    const gesture = Gesture.LongPress()
      .minDuration(300)
      .onStart(() => {
        holdRef.current = true;
        runOnJS(haptic)('light');
        runOnJS(setPlaying)(true);
      })
      .onFinalize(() => {
        if (holdRef.current) {
          holdRef.current = false;
          runOnJS(setPlaying)(false);
        }
      });
    return pagerPan ? gesture.simultaneousWithExternalGesture(pagerPan) : gesture;
  }, [pagerPan]);

  const togglePlaying = () => {
    haptic('light');
    setPlaying((current) => !current);
  };

  return (
    <GestureDetector gesture={longPress}>
      <LivePageWrap>
        <ZoomableImage
          asset={asset}
          controller={controller}
          pagerPan={pagerPan}
          dismiss={dismiss}
          onTap={onTap}
        />
        {playing ? (
          <LiveSurface player={player} contentFit="contain" pointerEvents="none" />
        ) : null}
        <PillWrap $bottom={insets.bottom + space[9]} pointerEvents="box-none">
          <LivePill
            $active={playing}
            onPress={togglePlaying}
            accessibilityLabel={playing ? 'Stop live photo' : 'Play live photo'}
            accessibilityRole="button"
            accessibilityState={{ selected: playing }}
          >
            <Icon
              name="radio-button-on"
              size={12}
              color={playing ? colors.onAccent : colors.textInverse}
            />
            <PillText $active={playing}>LIVE</PillText>
          </LivePill>
        </PillWrap>
      </LivePageWrap>
    </GestureDetector>
  );
}
