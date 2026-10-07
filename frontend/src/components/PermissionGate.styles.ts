import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

export const Container = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[8]}px;
`;

export const Content = styled(Animated.View)`
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  max-width: ${({ theme }) => theme.ms(340)}px;
`;

export const IconWrap = styled.View`
  width: ${({ theme }) => theme.ms(88)}px;
  height: ${({ theme }) => theme.ms(88)}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const Title = styled(ThemedText)`
  text-align: center;
`;

export const Subtitle = styled(ThemedText)`
  text-align: center;
  line-height: ${({ theme }) => theme.type.line.body}px;
`;

export const Button = styled(PressableScale)`
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[8]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const ButtonLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const Link = styled(PressableScale)`
  padding: ${({ theme }) => theme.space[2]}px;
`;
