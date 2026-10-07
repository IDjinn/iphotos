import { Pressable, ScrollView, View } from 'react-native';
import styled from 'styled-components/native';

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

export const HeaderSpacer = styled.View`
  width: 24px;
`;

export const Section = styled(View)`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  margin-top: ${({ theme }) => theme.space[5]}px;
`;

/** First section flush against the header (no top margin). */
export const FirstSection = styled(Section)`
  margin-top: 0px;
`;

export const SectionTitle = styled(ThemedText)`
  margin-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const RuntimeCard = styled.View`
  gap: ${({ theme }) => theme.space[2]}px;
`;

/** Selectable option row — dims when disabled, lightens on press. */
export const OptionRow = styled(Pressable)<{ $pressed: boolean; $disabled?: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed, $disabled }) => ($pressed ? 0.75 : $disabled ? 0.55 : 1)};
`;

export const RowText = styled(View)`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const RowLabel = styled(ThemedText)`
  flex: 1;
`;

export const NameLine = styled(View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const Badge = styled(View)`
  border-radius: ${({ theme }) => theme.radius.sm}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const BadgeText = styled(ThemedText)`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const Footnote = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[5]}px;
  padding-horizontal: ${({ theme }) => theme.space[8]}px;
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
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
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.outline};
`;

export const TrackFill = styled.View<{ $pct: number }>`
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  width: ${({ $pct }) => $pct}%;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const ErrorText = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
`;

export const ActionButton = styled(Pressable)<{ $pressed: boolean; $disabled?: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accent};
  opacity: ${({ $pressed, $disabled }) => ($pressed ? 0.85 : $disabled ? 0.55 : 1)};
`;

export const ActionButtonText = styled(ThemedText)`
  color: ${({ theme }) => theme.colors.textInverse};
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const TextButtonRow = styled(View)`
  flex-direction: row;
  justify-content: center;
  gap: ${({ theme }) => theme.space[6]}px;
`;

export const TextButton = styled(Pressable)`
  padding-vertical: ${({ theme }) => theme.space[1]}px;
`;
