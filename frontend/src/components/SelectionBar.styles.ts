import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { elevationMedium } from '@/theme/shared';

export const Wrap = styled(Animated.View)<{ $bottom: number }>`
  ${elevationMedium}
  position: absolute;
  left: ${({ theme }) => theme.space[4]}px;
  right: ${({ theme }) => theme.space[4]}px;
  bottom: ${({ $bottom }) => $bottom}px;
  flex-direction: row;
  align-items: center;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[1]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme }) => theme.colors.surfaceElevated};
`;

export const Exit = styled(Pressable)`
  width: ${({ theme }) => theme.ms(40)}px;
  height: ${({ theme }) => theme.ms(40)}px;
  align-items: center;
  justify-content: center;
`;

export const CountPill = styled.View`
  min-width: ${({ theme }) => theme.ms(32)}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const Count = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const Actions = styled.View`
  flex: 1;
  flex-direction: row;
  justify-content: space-evenly;
`;

export const ActionButton = styled(Pressable)`
  width: ${({ theme }) => theme.ms(44)}px;
  height: ${({ theme }) => theme.ms(44)}px;
  align-items: center;
  justify-content: center;
`;
