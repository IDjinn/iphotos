import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

export const Screen = styled.ScrollView`
  flex: 1;
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const Utilities = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-top: ${({ theme }) => theme.space[1]}px;
`;

export const UtilityCard = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const UtilityIcon = styled.View`
  width: ${({ theme }) => theme.ms(42)}px;
  height: ${({ theme }) => theme.ms(42)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const UtilityMeta = styled.View`
  flex: 1;
`;

export const UtilityTitle = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const SectionHeader = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const AlbumGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  justify-content: center;
`;

/** Album tile width — percentage of the wrapping grid, capped for wide screens. */
export const AlbumCardWrap = styled.View`
  width: 47.5%;
  max-width: ${({ theme }) => theme.ms(200)}px;
`;

export const AlbumCover = styled(Pressable)`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const AlbumCoverImage = styled(Image)`
  ${absoluteFill}
`;

export const AlbumTitle = styled(ThemedText)`
  padding-top: ${({ theme }) => theme.space[2]}px;
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;
