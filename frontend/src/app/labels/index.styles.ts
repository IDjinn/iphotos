import { Pressable, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View`
  flex: 1;
`;

export const Header = styled.View<{ $insetTop: number }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  padding-top: ${({ $insetTop }) => $insetTop}px;
  height: 56px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const FilterWrap = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-bottom: ${({ theme }) => theme.space[3]}px;
`;

export const FilterBar = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  height: 40px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const FilterInput = styled(TextInput)`
  flex: 1;
  font-size: ${({ theme }) => theme.type.size.body}px;
  padding-vertical: 0px;
  color: ${({ theme }) => theme.colors.text};
`;

export const ProgressWrap = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-bottom: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const StatusText = styled(ThemedText)`
  text-align: center;
`;

export const Track = styled.View`
  height: 5px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.outline};
`;

export const TrackFill = styled.View<{ $pct: number }>`
  height: 5px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  width: ${({ $pct }) => $pct}%;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const LabelRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed }) => ($pressed ? 0.75 : 1)};
`;

export const RowLabel = styled(ThemedText)`
  flex: 1;
`;

export const FooterNote = styled(ThemedText)`
  text-align: center;
  padding-top: ${({ theme }) => theme.space[3]}px;
  line-height: ${({ theme }) => theme.type.line.small}px;
`;
