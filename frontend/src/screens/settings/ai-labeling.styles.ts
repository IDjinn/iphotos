import { Pressable, ScrollView, View } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled(View)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Scroll = styled(ScrollView)`
  flex: 1;
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

export const Body = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  gap: ${({ theme }) => theme.space[4]}px;
`;

export const Card = styled(View)`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const CardText = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const Form = styled.View`
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const PrimaryButton = styled(Pressable)<{ $pressed: boolean; $disabled?: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accent};
  opacity: ${({ $pressed, $disabled }) => ($pressed ? 0.85 : $disabled ? 0.55 : 1)};
`;

export const PrimaryButtonText = styled(ThemedText)`
  color: ${({ theme }) => theme.colors.textInverse};
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const TextButton = styled(Pressable)`
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
`;

export const ProgressBlock = styled(View)`
  gap: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
`;

export const ProgressLine = styled(View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const Track = styled(View)`
  height: ${({ theme }) => theme.ms(6)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.outline};
`;

export const TrackFill = styled.View<{ $pct: number }>`
  height: ${({ theme }) => theme.ms(6)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  width: ${({ $pct }) => $pct}%;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const ErrorText = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
`;

export const Footnote = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
`;
