import { Pressable, ScrollView, TextInput, View } from 'react-native';
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

export const Body = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const NoteCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const Group = styled.View`
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const GroupTitle = styled(ThemedText)`
  text-transform: uppercase;
`;

export const Card = styled(View)`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const FolderRow = styled(View)<{ $divided: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-top-width: ${({ theme, $divided }) => ($divided ? theme.hairline : 0)}px;
  border-top-color: ${({ theme }) => theme.colors.outline};
`;

export const HeldRow = styled(View)<{ $divided: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-top-width: ${({ theme, $divided }) => ($divided ? theme.hairline : 0)}px;
  border-top-color: ${({ theme }) => theme.colors.outline};
`;

export const CardText = styled(View)`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const Pill = styled(Pressable)<{ $tone: 'accent' | 'outline' }>`
  border-radius: ${({ theme }) => theme.radius.full}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme, $tone }) => ($tone === 'accent' ? theme.colors.accentSoft : theme.colors.outline)};
`;

export const Search = styled(TextInput)`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

export const FilterRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const FilterChip = styled(Pressable)<{ $active: boolean }>`
  border-radius: ${({ theme }) => theme.radius.full}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : theme.colors.surface)};
`;

export const EmptyText = styled(ThemedText)`
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  text-align: center;
`;

export const Summary = styled(ThemedText)`
  text-align: center;
`;

export const Note = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
  margin-top: ${({ theme }) => theme.space[2]}px;
`;
