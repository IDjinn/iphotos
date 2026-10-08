import { Pressable, ScrollView, View } from 'react-native';
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
  padding-top: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[3]}px;
`;

/** Pressable row card with pressed feedback. */
export const Card = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed }) => ($pressed ? 0.75 : 1)};
`;

export const CardText = styled(View)`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const CardColumn = styled(View)`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const RuleRow = styled(View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const RuleText = styled(ThemedText)`
  flex: 1;
  line-height: ${({ theme }) => theme.type.line.small}px;
`;

export const ReportRow = styled(View)`
  flex-direction: row;
  justify-content: space-between;
`;

export const UsageBar = styled(View)`
  flex-direction: row;
  height: ${({ theme }) => theme.ms(8)}px;
  border-radius: ${({ theme }) => theme.radius.xs}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.outline};
`;

export const UsageFill = styled.View<{ $fraction: number }>`
  border-radius: ${({ theme }) => theme.radius.xs}px;
  flex: ${({ $fraction }) => Math.max($fraction, 0.001)};
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const PrimaryButton = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const PrimaryButtonText = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const SecondaryButton = styled(PressableScale)`
  align-items: center;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
`;

export const SecondaryButtonText = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const ErrorText = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
`;

export const Note = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
  margin-top: ${({ theme }) => theme.space[2]}px;
`;
