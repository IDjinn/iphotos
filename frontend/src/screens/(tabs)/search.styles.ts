import { Pressable, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View<{ $insetTop?: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Header = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const SearchBar = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  height: ${({ theme }) => theme.ms(44)}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const Input = styled(TextInput)`
  flex: 1;
  font-size: ${({ theme }) => theme.type.size.body}px;
  padding-vertical: 0px;
  color: ${({ theme }) => theme.colors.text};
`;

export const Suggestions = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[1]}px;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const ChipHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export const ChipLabel = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[1]}px;
`;

export const ChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const Chip = styled(Pressable)`
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const RecentChip = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const AlbumMatches = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const Center = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;
