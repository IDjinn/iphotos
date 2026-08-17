import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { Durations, Springs } from '@/theme/tokens';
import { haptic } from '@/utils/haptics';

interface ChromeButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  filled?: boolean;
  accent?: string;
  pop?: boolean;
}

function ChromeButton({ icon, label, onPress, filled, pop }: ChromeButtonProps) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (pop) scale.value = withSpring(1, Springs.bouncy);
  }, [pop, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        style={styles.iconButton}
        accessibilityLabel={label}
        onPress={() => {
          scale.value = 0.8;
          scale.value = withSpring(1, Springs.bouncy);
          haptic('light');
          onPress();
        }}
      >
        <Icon name={icon as never} size={24} color={filled ? '#7EACF8' : '#FFFFFF'} />
      </Pressable>
    </Animated.View>
  );
}

interface ViewerChromeProps {
  visible: boolean;
  title: string;
  isVideo: boolean;
  isFavorite: boolean;
  playing: boolean;
  muted: boolean;
  favoriteKey: number;
  onClose: () => void;
  onInfo: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onMore: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}

/** Viewer top and bottom bars: slide/fade in sync, white-on-media icons. */
export function ViewerChrome(props: ViewerChromeProps) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = props.visible
      ? withSpring(1, Springs.snappy)
      : withTiming(0, { duration: Durations.fast });
  }, [props.visible, progress]);

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * -56 }],
    opacity: progress.value,
    pointerEvents: progress.value > 0.5 ? 'auto' : 'none',
  }));

  const bottomStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 64 }],
    opacity: progress.value,
    pointerEvents: progress.value > 0.5 ? 'auto' : 'none',
  }));

  return (
    <>
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 6 }, topStyle]}>
        <ChromeButton icon="close" label="Close" onPress={props.onClose} />
        <ThemedText variant="body" color="inverse" style={styles.title} numberOfLines={1}>
          {props.title}
        </ThemedText>
        <ChromeButton icon="information-circle" label="Info" onPress={props.onInfo} />
      </Animated.View>

      <Animated.View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }, bottomStyle]}>
        <View style={styles.scrim} />
        {props.isVideo ? (
          <>
            <ChromeButton
              icon={props.playing ? 'pause' : 'play'}
              label={props.playing ? 'Pause' : 'Play'}
              onPress={props.onTogglePlay}
            />
            <ChromeButton
              icon={props.muted ? 'volume-mute' : 'volume-high'}
              label={props.muted ? 'Unmute' : 'Mute'}
              onPress={props.onToggleMute}
            />
          </>
        ) : null}
        <View style={styles.spacer} />
        <ChromeButton icon="share-outline" label="Share" onPress={props.onShare} />
        <ChromeButton
          icon={props.isFavorite ? 'heart' : 'heart-outline'}
          label="Favorite"
          filled={props.isFavorite}
          pop={props.isFavorite}
          onPress={props.onToggleFavorite}
        />
        <ChromeButton icon="trash-outline" label="Delete" onPress={props.onDelete} />
        <ChromeButton icon="ellipsis-horizontal-circle" label="More" onPress={props.onMore} />
      </Animated.View>
    </>
  );
}

const WHITE = '#FFFFFF';

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: WHITE,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    marginHorizontal: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  spacer: { flex: 1 },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
