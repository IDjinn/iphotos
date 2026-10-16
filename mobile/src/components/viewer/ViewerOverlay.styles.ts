import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

export const OverlayRoot = styled.View`
  ${absoluteFill}
`;

export const Backdrop = styled(Animated.View)`
  ${absoluteFill}
  background-color: ${({ theme }) => theme.colors.scrimSolid};
`;

export const PagerLayer = styled(Animated.View)`
  ${absoluteFill}
`;

export const HeroImage = styled(Image)`
  ${absoluteFill}
`;

export const SheetHeading = styled(ThemedText)`
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-top: ${({ theme }) => theme.space[1]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const ActionRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  opacity: ${({ $pressed }) => ($pressed ? 0.6 : 1)};
`;

export const InfoRowWrap = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const InfoLabel = styled(ThemedText)`
  text-transform: uppercase;
  letter-spacing: ${({ theme }) => theme.type.letterSpacing.tight}px;
  font-size: ${({ theme }) => theme.type.size.caption}px;
`;
