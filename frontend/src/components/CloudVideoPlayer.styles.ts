import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import { VideoView } from 'expo-video';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

export const Fill = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.scrimSolid};
`;

export const PosterImage = styled(Image)`
  ${absoluteFill}
`;

export const PlayerSurface = styled(VideoView)`
  ${absoluteFill}
`;

export const Center = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[8]}px;
`;

export const ErrorText = styled(ThemedText)`
  text-align: center;
`;

export const RetryButton = styled(Pressable)`
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const CloseButton = styled(Pressable)<{ $top: number }>`
  position: absolute;
  right: ${({ theme }) => theme.space[5]}px;
  top: ${({ $top }) => $top}px;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
`;
