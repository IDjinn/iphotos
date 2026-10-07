import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View<{ $insetTop?: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Center = styled.View<{ $insetTop?: number }>`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Header = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: ${({ theme }) => theme.ms(52)}px;
`;

export const HeaderTitle = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const ExpoGoBanner = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  margin-horizontal: ${({ theme }) => theme.space[4]}px;
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const BannerText = styled(ThemedText)`
  flex: 1;
`;
