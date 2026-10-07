import { ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
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
