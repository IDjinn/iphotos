import { ActivityIndicator, Text } from 'react-native';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { absoluteFill } from '@/theme/shared';

export const PageFill = styled.View`
  flex: 1;
`;

export const PosterImage = styled(Image)`
  ${absoluteFill}
`;

export const VideoSurface = styled(VideoView)`
  ${absoluteFill}
`;

export const Spinner = styled(ActivityIndicator)`
  position: absolute;
  align-self: center;
  bottom: 18%;
`;

/** Bottom scrubber zone (iOS Photos style): labels above a thin track. */
export const ScrubberZone = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: ${({ theme }) => theme.space[3]}px;
`;

export const ScrubLabels = styled(Animated.View)`
  flex-direction: row;
  justify-content: space-between;
  margin-horizontal: ${({ theme }) => theme.space[4]}px;
  margin-bottom: ${({ theme }) => theme.space[1]}px;
`;

export const ScrubLabel = styled(Text)`
  color: ${({ theme }) => theme.colors.textInverse};
  font-size: ${({ theme }) => theme.type.size.caption}px;
  font-variant-numeric: tabular-nums;
  text-shadow-color: rgba(0, 0, 0, 0.6);
  text-shadow-offset: 0px 1px;
  text-shadow-radius: 4px;
`;

/** Hit target wrapping the track — the thumb slides within its width. */
export const ScrubHit = styled.View`
  height: ${({ theme }) => theme.ms(24)}px;
  margin-horizontal: ${({ theme }) => theme.space[3]}px;
  justify-content: center;
`;

export const ScrubTrack = styled(Animated.View)`
  height: ${({ theme }) => theme.ms(3)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: rgba(255, 255, 255, 0.28);
  overflow: hidden;
`;

export const ScrubFill = styled(Animated.View)`
  height: 100%;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const ScrubThumb = styled(Animated.View)<{ $size: number }>`
  position: absolute;
  top: 50%;
  left: 0;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  margin-top: ${({ $size }) => -$size / 2}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.textInverse};
`;
