import { Pressable, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

export const Screen = styled(ScrollView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: 52px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

/** Spacer mirroring the back icon so the centered title stays centered. */
export const HeaderSpacer = styled.View`
  width: 24px;
`;

export const Form = styled(Animated.View)`
  padding-horizontal: ${({ theme }) => theme.space[6]}px;
  padding-top: ${({ theme }) => theme.space[4]}px;
  gap: ${({ theme }) => theme.space[4]}px;
`;

export const Forgot = styled(ThemedText)`
  align-self: flex-end;
`;

export const Submit = styled(PressableScale)`
  height: 52px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  justify-content: center;
  margin-top: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const Banner = styled(Animated.View)`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding: ${({ theme }) => theme.space[3]}px;
  align-items: flex-start;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const BannerText = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const BannerAction = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const AckRow = styled(Pressable)`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const AckText = styled(ThemedText)`
  flex: 1;
  line-height: ${({ theme }) => theme.type.line.small}px;
`;
