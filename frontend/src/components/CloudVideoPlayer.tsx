import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
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
      <View style={styles.fill}>{photo ? <VideoSurface photo={photo} onClose={onClose} /> : null}</View>
    </Modal>
  );
}

type SurfaceState =
  | { status: 'loading'; fraction: number }
  | { status: 'ready'; uri: string }
  | { status: 'error' };

function VideoSurface({ photo, onClose }: { photo: CloudPhoto; onClose: () => void }) {
  const { colors } = useTheme();
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
    <View style={styles.fill}>
      <Image
        source={{ uri: fileUrl(photo.id, 'thumbnail'), headers: authHeaders() }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
      />
      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <ThemedText variant="bodySmall" color="secondary">
            Loading video… {Math.round(state.fraction * 100)}%
          </ThemedText>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.center}>
          <Icon name="alert-circle" size={32} color={colors.danger} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.errorText}>
            Couldn&apos;t load this video. Check your connection and try again.
          </ThemedText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close player"
            style={[styles.retryButton, { borderColor: colors.accent }]}
          >
            <ThemedText variant="bodySmall" color="accent">
              Close
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      {state.status === 'ready' ? <LoadedPlayer uri={state.uri} /> : null}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close player"
        hitSlop={12}
        style={[styles.close, { top: insets.top + 12 }]}
      >
        <Icon name="close" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

function LoadedPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    player.play();
  }, [player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { textAlign: 'center' },
  retryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  close: { position: 'absolute', right: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
