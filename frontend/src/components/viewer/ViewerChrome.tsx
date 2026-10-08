import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  BottomBar,
  IconButton,
  Scrim,
  Spacer,
  Title,
  TopBar,
} from '@/components/viewer/ViewerChrome.styles';
import { Durations, Springs } from '@/theme/tokens';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface ChromeButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  filled?: boolean;
  pop?: boolean;
}

function ChromeButton({ icon, label, onPress, filled, pop }: ChromeButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (pop) scale.value = withSpring(1, Springs.bouncy);
  }, [pop, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <IconButton
        accessibilityLabel={label}
        onPress={() => {
          scale.value = 0.8;
          scale.value = withSpring(1, Springs.bouncy);
          haptic('light');
          onPress();
        }}
      >
        <Icon name={icon as never} size={24} color={filled ? colors.onMediaAccent : colors.textInverse} />
      </IconButton>
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
  /** 'cloud' swaps device actions (share/favorite/more) for download. */
  variant?: 'device' | 'cloud';
  onClose: () => void;
  onInfo: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onMore: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}

/** Viewer top and bottom bars: slide/fade in sync, white-on-media icons. */
export function ViewerChrome(props: ViewerChromeProps) {
  const { space } = useTheme();
  const cloud = props.variant === 'cloud';
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
      <TopBar style={topStyle} $insetTop={insets.top + space[1]}>
        <ChromeButton icon="close" label="Close" onPress={props.onClose} />
        <Title variant="body" color="inverse" numberOfLines={1}>
          {props.title}
        </Title>
        <ChromeButton icon="information-circle" label="Info" onPress={props.onInfo} />
      </TopBar>

      <BottomBar style={bottomStyle} $insetBottom={insets.bottom + space[2]}>
        <Scrim />
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
        <Spacer />
        {cloud ? (
          <ChromeButton icon="cloud-download-outline" label="Download" onPress={() => props.onDownload?.()} />
        ) : (
          <>
            <ChromeButton icon="share-outline" label="Share" onPress={props.onShare} />
            <ChromeButton
              icon={props.isFavorite ? 'heart' : 'heart-outline'}
              label="Favorite"
              filled={props.isFavorite}
              pop={props.isFavorite}
              onPress={props.onToggleFavorite}
            />
          </>
        )}
        <ChromeButton icon="trash-outline" label="Delete" onPress={props.onDelete} />
        {cloud ? null : <ChromeButton icon="ellipsis-horizontal-circle" label="More" onPress={props.onMore} />}
      </BottomBar>
    </>
  );
}
