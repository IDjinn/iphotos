import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled(View)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const HeaderInset = styled.View<{ $insetTop: number }>`
  padding-top: ${({ $insetTop }) => $insetTop}px;
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: ${({ theme }) => theme.ms(52)}px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const HeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;

export const Body = styled(ScrollView)`
  flex: 1;
`;

export const BodyContent = styled(View)`
  padding: ${({ theme }) => theme.space[5]}px;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const Intro = styled(Animated.View)`
  gap: ${({ theme }) => theme.space[3]}px;
  align-items: flex-start;
`;

export const IntroTitle = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const IntroText = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.body}px;
`;

export const StatusTitle = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const Field = styled(TextInput)`
  width: 100%;
  border-radius: ${({ theme }) => theme.radius.md}px;
  border-width: ${({ theme }) => theme.border.width}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.type.size.body}px;
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme }) => theme.colors.outline};
`;

export const PrimaryButton = styled(Pressable)<{ $pressed: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  align-self: stretch;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.accent};
  opacity: ${({ $pressed }) => ($pressed ? 0.85 : 1)};
`;

export const PrimaryButtonLabel = styled(ThemedText)`
  color: ${({ theme }) => theme.colors.textInverse};
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const TextButton = styled(Pressable)`
  align-self: center;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
`;

export const GridWrap = styled(View)`
  flex: 1;
`;

export const StatusRow = styled(View)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-bottom-width: ${({ theme }) => theme.hairline}px;
  border-bottom-color: ${({ theme }) => theme.colors.outline};
`;

export const StatusText = styled(ThemedText)`
  flex: 1;
`;
