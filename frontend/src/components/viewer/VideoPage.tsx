import { useEffect, useMemo, useState } from 'react';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useVideoPlayer } from 'expo-video';
import { runOnJS } from 'react-native-reanimated';

import {
  PageFill,
  PosterImage,
  Spinner,
  VideoSurface,
} from '@/components/viewer/VideoPage.styles';
import { resolveVaultPlayback } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';
import { useTheme } from '@/theme/context';

interface VideoPageProps {
  asset: PhotoAsset;
  /** Whether this page is the active (center) page. */
  active: boolean;
  playing: boolean;
  muted: boolean;
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

function VideoPageInner({ asset, active, playing, muted, pagerPan, onTap, uri }: VideoPageProps & { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

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
      }, 150);
      return () => clearTimeout(t);
    }
  }, [active, player]);

  const singleTap = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(onTap)();
    });
    return pagerPan ? tap.simultaneousWithExternalGesture(pagerPan) : tap;
  }, [onTap, pagerPan]);

  return (
    <GestureDetector gesture={singleTap}>
      <PageFill>
        <VideoSurface player={player} contentFit="contain" nativeControls={false} />
      </PageFill>
    </GestureDetector>
  );
}
