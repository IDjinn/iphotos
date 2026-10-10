import { ActivityIndicator, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Center = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[8]}px;
`;

export const RetryButton = styled(Pressable)`
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const EmptyText = styled(ThemedText)`
  text-align: center;
`;

export const Cell = styled(Pressable)<{ $columns: number }>`
  flex: ${({ $columns }) => 1 / $columns};
  aspect-ratio: 1;
  padding: 1px;
`;

export const CellImage = styled(Image)`
  flex: 1;
  border-radius: ${({ theme }) => theme.radius.xs}px;
  background-color: rgba(128, 128, 128, 0.15);
`;

export const StateBadge = styled.View`
  position: absolute;
  top: ${({ theme }) => theme.space[1]}px;
  right: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  padding: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme }) => theme.colors.background};
`;

/** Corner badge over grid media: play for videos, live rings for Live Photos. */
export const MediaBadge = styled.View`
  position: absolute;
  top: ${({ theme }) => theme.space[1]}px;
  left: ${({ theme }) => theme.space[1]}px;
  width: ${({ theme }) => theme.ms(22)}px;
  height: ${({ theme }) => theme.ms(22)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.scrim};
  align-items: center;
  justify-content: center;
`;

export const Duration = styled(Text)`
  position: absolute;
  bottom: ${({ theme }) => theme.space[1]}px;
  left: ${({ theme }) => theme.space[1]}px;
  color: ${({ theme }) => theme.colors.textInverse};
  font-size: ${({ theme }) => theme.type.size.caption}px;
  font-weight: ${({ theme }) => theme.type.weight.medium};
  text-shadow-color: rgba(0, 0, 0, 0.6);
  text-shadow-offset: 0px 1px;
  text-shadow-radius: 4px;
`;

export const FooterSpin = styled(ActivityIndicator)`
  margin-vertical: ${({ theme }) => theme.space[4]}px;
`;

export const FilterRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const Chip = styled(Pressable)<{ $selected: boolean; $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.accent : 'rgba(128, 128, 128, 0.35)'};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme, $selected }) => ($selected ? theme.colors.accent : 'transparent')};
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

export const ChipText = styled(Text)<{ $selected: boolean }>`
  font-size: ${({ theme }) => theme.type.size.label}px;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
  color: ${({ theme, $selected }) => ($selected ? theme.colors.textInverse : theme.colors.textSecondary)};
`;

export const SortSpacer = styled.View`
  flex: 1;
`;

export const SortChip = styled(Chip)`
  align-self: flex-start;
`;
