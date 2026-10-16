import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer } from 'expo-video';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Center,
  CloseButton,
  ErrorText,
  Fill,
  PlayerSurface,
  PosterImage,
  RetryButton,
} from '@/components/CloudVideoPlayer.styles';
import { authHeaders } from '@/data/api-client';
import { fileUrl, type CloudPhoto } from '@/data/cloud-photos-repository';
import { useTheme } from '@/theme/context';

interface CloudVideoPlayerProps {
  photo: CloudPhoto | null;
  onClose: () => void;
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/3gpp': '3gp',
};

/**
 * Fullscreen player for cloud videos. The original is streamed to a cache file
 * first (authenticated download, poster shown meanwhile) and handed to
 * expo-video — local files keep seeking and background playback reliable.
 * Exits: the close button or Android back.
 */
export function CloudVideoPlayer({ photo, onClose }: CloudVideoPlayerProps) {
  return (
    <Modal
      visible={photo !== null}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Fill>{photo ? <VideoSurface photo={photo} onClose={onClose} /> : null}</Fill>
    </Modal>
  );
}

type SurfaceState =
  | { status: 'loading'; fraction: number }
  | { status: 'ready'; uri: string }
  | { status: 'error' };

function VideoSurface({ photo, onClose }: { photo: CloudPhoto; onClose: () => void }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SurfaceState>({ status: 'loading', fraction: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { createDownloadResumable } = await import('expo-file-system/legacy');
      const { cacheDirectory } = await import('expo-file-system/legacy');
      const ext = EXT_BY_MIME[photo.mimeType] ?? 'mp4';
      const target = `${cacheDirectory}cloud-video-${photo.id}.${ext}`;
      const resumable = createDownloadResumable(
        fileUrl(photo.id, 'original'),
        target,
        { headers: authHeaders() },
        (progress) => {
          const total = progress.totalBytesExpectedToWrite ?? 0;
          if (alive && total > 0) {
            setState({ status: 'loading', fraction: progress.totalBytesWritten / total });
          }
        },
      );
      try {
        const result = await resumable.downloadAsync();
        if (alive && result?.uri) setState({ status: 'ready', uri: result.uri });
        else if (alive) setState({ status: 'error' });
      } catch {
        if (alive) setState({ status: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [photo.id, photo.mimeType]);

  return (
    <Fill>
      <PosterImage
        source={{ uri: fileUrl(photo.id, 'thumbnail'), headers: authHeaders() }}
        contentFit="contain"
      />
      {state.status === 'loading' ? (
        <Center>
          <ActivityIndicator size="large" color={colors.accent} />
          <ThemedText variant="bodySmall" color="secondary">
            Loading video… {Math.round(state.fraction * 100)}%
          </ThemedText>
        </Center>
      ) : null}
      {state.status === 'error' ? (
        <Center>
          <Icon name="alert-circle" size={32} color={colors.danger} />
          <ErrorText variant="bodySmall" color="secondary">
            Couldn&apos;t load this video. Check your connection and try again.
          </ErrorText>
          <RetryButton onPress={onClose} accessibilityRole="button" accessibilityLabel="Close player">
            <ThemedText variant="bodySmall" color="accent">
              Close
            </ThemedText>
          </RetryButton>
        </Center>
      ) : null}
      {state.status === 'ready' ? <LoadedPlayer uri={state.uri} /> : null}
      <CloseButton
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close player"
        hitSlop={12}
        $top={insets.top + space[3]}
      >
        <Icon name="close" size={26} color={colors.text} />
      </CloseButton>
    </Fill>
  );
}

function LoadedPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    player.play();
  }, [player]);

  return <PlayerSurface player={player} contentFit="contain" />;
}
