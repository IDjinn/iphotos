import { Image } from 'expo-image';
import { Pressable, ScrollView, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

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

// ── People & labels (doc 18 §10) ────────────────────────────────────────────

/** Horizontal circle rail — the Search tab's People entry (Google-Photos style). */
export const PeopleRow = styled(ScrollView).attrs<{ $inset?: boolean }>((props) => ({
  horizontal: true,
  showsHorizontalScrollIndicator: false,
  contentContainerStyle: {
    paddingHorizontal: props.theme.space[4],
    gap: props.theme.space[3],
  },
}))``;

export const PersonChip = styled(Pressable)`
  width: ${({ theme }) => theme.ms(76)}px;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const PersonChipCircle = styled.View`
  width: ${({ theme }) => theme.ms(64)}px;
  height: ${({ theme }) => theme.ms(64)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PersonChipImage = styled(Image)`
  ${absoluteFill}
`;

export const PersonChipName = styled(ThemedText)`
  font-size: ${({ theme }) => theme.type.size.bodySmall}px;
  color: ${({ theme }) => theme.colors.text};
`;

/** Horizontal chip rail for backend scene labels. */
export const LabelChipRow = styled(ScrollView).attrs((props) => ({
  horizontal: true,
  showsHorizontalScrollIndicator: false,
  contentContainerStyle: {
    paddingHorizontal: props.theme.space[4],
    gap: props.theme.space[2],
  },
}))``;

export const LabelChip = styled(Pressable)`
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const LabelChipText = styled(ThemedText)`
  text-transform: capitalize;
`;
