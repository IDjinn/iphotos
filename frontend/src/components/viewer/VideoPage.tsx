import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useWindowDimensions } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  PageFill,
  PosterImage,
  ScrubFill,
  ScrubHit,
  ScrubLabel,
  ScrubLabels,
  ScrubThumb,
  ScrubTrack,
  ScrubberZone,
  Spinner,
  VideoSurface,
} from '@/components/viewer/VideoPage.styles';
import { resolveVaultPlayback } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';
import { useTheme } from '@/theme/context';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

/** Double-tap seek step (iOS Photos skips ±10 s). */
const SKIP_SECONDS = 10;

interface VideoPageProps {
  asset: PhotoAsset;
  /** Whether this page is the active (center) page. */
  active: boolean;
  playing: boolean;
  muted: boolean;
  /** Whether the overlay chrome is showing — the scrubber mirrors it. */
  chromeVisible: boolean;
  pagerPan?: GestureType | null;
  onTap: () => void;
}

/**
 * Fullscreen video page backed by expo-video. Vault videos decrypt their
 * playable file on mount (the grid only decrypts the poster), so the player
 * is created inside an inner component once the URI resolves.
 */
export function VideoPage(props: VideoPageProps) {
  const { asset, pagerPan, onTap } = props;
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(
    asset.vaultId ? null : asset.uri || null
  );

  useEffect(() => {
    let alive = true;
    if (!asset.vaultId) return;
    resolveVaultPlayback(asset.vaultId)
      .then((resolved) => {
        if (alive) setUri(resolved);
      })
      .catch(() => {
        if (alive) setUri('');
      });
    return () => {
      alive = false;
    };
  }, [asset.vaultId]);

  const singleTap = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(onTap)();
    });
    return pagerPan ? tap.simultaneousWithExternalGesture(pagerPan) : tap;
  }, [onTap, pagerPan]);

  if (uri === null) {
    // Decrypting the vault file — show the poster meanwhile.
    return (
      <GestureDetector gesture={singleTap}>
        <PageFill>
          {asset.uri ? (
            <PosterImage source={{ uri: asset.uri }} contentFit="contain" />
          ) : null}
          <Spinner size="large" color={colors.accent} />
        </PageFill>
      </GestureDetector>
    );
  }

  if (uri === '') {
    return (
      <GestureDetector gesture={singleTap}>
        <PageFill />
      </GestureDetector>
    );
  }

  return <VideoPageInner {...props} uri={uri} />;
}

function VideoPageInner({
  asset,
  active,
  playing,
  muted,
  chromeVisible,
  pagerPan,
  onTap,
  uri,
}: VideoPageProps & { uri: string }) {
  const { width: viewW } = useWindowDimensions();
  const theme = useTheme();
  const thumbSize = theme.ms(14);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  // Scrubber state: shared values drive the bar off the UI thread; the
  // whole-second labels re-render only when they actually change.
  const progress = useSharedValue(0);
  const duration = useSharedValue(0);
  const trackWidth = useSharedValue(0);
  const expanded = useSharedValue(0);
  const chrome = useSharedValue(chromeVisible ? 1 : 0);
  const durationRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const [durationSec, setDurationSec] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (active && playing) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, playing, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  // Reset position when leaving the page.
  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => {
        player.currentTime = 0;
        progress.value = 0;
        setElapsedSec(0);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [active, player, progress]);

  // Mirror the player clock into the scrubber (UI thread) and the labels (JS).
  useEffect(() => {
    const sub = player.addListener('timeUpdate', (event) => {
      progress.value = event.currentTime;
      const dur = player.duration;
      if (dur > 0 && dur !== durationRef.current) {
        durationRef.current = dur;
        duration.value = dur;
        setDurationSec(dur);
      }
      const secs = Math.floor(event.currentTime);
      setElapsedSec((prev) => (prev === secs ? prev : secs));
    });
    return () => sub.remove();
  }, [player, progress, duration]);

  useEffect(() => {
    chrome.value = withTiming(chromeVisible ? 1 : 0, { duration: 180 });
  }, [chromeVisible, chrome]);

  const beginScrub = useCallback(() => {
    wasPlayingRef.current = playing;
    player.pause();
    haptic('light');
  }, [player, playing]);

  const seekToFraction = useCallback(
    (fraction: number) => {
      const dur = durationRef.current;
      if (dur <= 0) return;
      const next = Math.min(dur, Math.max(0, fraction * dur));
      player.currentTime = next;
      setElapsedSec(Math.floor(next));
    },
    [player]
  );

  const endScrub = useCallback(() => {
    if (wasPlayingRef.current) player.play();
  }, [player]);

  const skip = useCallback(
    (delta: number) => {
      player.currentTime = Math.max(0, player.currentTime + delta);
      haptic('light');
    },
    [player]
  );

  // Surface: double-tap skips ±10 s, single tap toggles the chrome (it waits
  // for the double-tap to fail — the same trade-off iOS Photos makes).
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      runOnJS(skip)(event.x > viewW / 2 ? SKIP_SECONDS : -SKIP_SECONDS);
    });
  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      runOnJS(onTap)();
    });

  const surfaceGestures = useMemo(() => {
    if (pagerPan) {
      doubleTap.simultaneousWithExternalGesture(pagerPan);
      singleTap.simultaneousWithExternalGesture(pagerPan);
    }
    return Gesture.Simultaneous(doubleTap, singleTap);
  }, [doubleTap, singleTap, pagerPan]);

  // Scrubber drag: exclusive against the pager — once the scrub activates on
  // the strip, a page swipe must not steal the gesture.
  const scrubPan = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(2)
      .maxPointers(1)
      .onStart(() => {
        expanded.value = withTiming(1, { duration: 140 });
        runOnJS(beginScrub)();
      })
      .onUpdate((event) => {
        if (trackWidth.value <= 0 || duration.value <= 0) return;
        const fraction = clamp(event.x / trackWidth.value, 0, 1);
        progress.value = fraction * duration.value;
        runOnJS(seekToFraction)(fraction);
      })
      .onEnd(() => {
        expanded.value = withTiming(chrome.value, { duration: 140 });
        runOnJS(endScrub)();
      });
    return pagerPan ? pan.blocksExternalGesture(pagerPan) : pan;
  }, [beginScrub, seekToFraction, endScrub, chrome, expanded, progress, duration, trackWidth, pagerPan]);

  const scrubberStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const labelsStyle = useAnimatedStyle(() => ({ opacity: expanded.value }));
  const fillStyle = useAnimatedStyle(() => ({
    width:
      duration.value > 0 ? (progress.value / duration.value) * trackWidth.value : 0,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: expanded.value,
    transform: [
      {
        translateX:
          duration.value > 0
            ? (progress.value / duration.value) * trackWidth.value
            : -thumbSize / 2,
      },
    ],
  }));

  return (
    <GestureDetector gesture={surfaceGestures}>
      <PageFill>
        <VideoSurface player={player} contentFit="contain" nativeControls={false} />
        <Animated.View
          style={scrubberStyle}
          pointerEvents={chromeVisible ? 'auto' : 'none'}
        >
          <ScrubberZone>
            <ScrubLabels style={labelsStyle} pointerEvents="none">
              <ScrubLabel>{formatDuration(elapsedSec)}</ScrubLabel>
              <ScrubLabel>
                -{formatDuration(Math.max(0, durationSec - elapsedSec))}
              </ScrubLabel>
            </ScrubLabels>
            <GestureDetector gesture={scrubPan}>
              <ScrubHit
                onLayout={(e) => {
                  trackWidth.value = Math.max(0, e.nativeEvent.layout.width - thumbSize);
                }}
              >
                <ScrubTrack>
                  <ScrubFill style={fillStyle} />
                </ScrubTrack>
                <ScrubThumb $size={thumbSize} style={thumbStyle} pointerEvents="none" />
              </ScrubHit>
            </GestureDetector>
          </ScrubberZone>
        </Animated.View>
      </PageFill>
    </GestureDetector>
  );
}
