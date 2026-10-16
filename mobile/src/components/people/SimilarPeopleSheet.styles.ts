import { FlatList, Pressable } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import type { PersonSimilar } from '@/data/people-repository';

/** "Similar people" sheet (doc 18 §7.3): the owner's other people ranked by
 * centroid similarity to the current person — multi-select, one atomic merge. */

export const SheetContent = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
`;

export const TitleBlock = styled.View`
  gap: ${({ theme }) => theme.space[1]}px;
`;

/** The ranked list owns the sheet's remaining height — a FlatList without a
 * definite frame grows to its content and can never scroll. */
export const SimilarList = styled(FlatList<PersonSimilar>)`
  flex: 1;
`;

export const SimilarRow = styled(Pressable)<{ $pressed: boolean; $selected: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ $selected, theme }) =>
    $selected ? theme.colors.accent : theme.colors.outline};
  background-color: ${({ $selected, theme }) =>
    $selected ? theme.colors.accentSoft : 'transparent'};
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

export const RowMeta = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const RowName = styled(ThemedText)``;

export const RowSkeleton = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[2]}px;
`;

export const EmptyNotice = styled.View`
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[6]}px;
`;

export const Footer = styled.View`
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;
