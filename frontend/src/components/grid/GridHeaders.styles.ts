import { Pressable } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const MonthWrap = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.backgroundSoft};
`;

export const MonthLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const DayWrap = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[2]}px;
  padding-bottom: ${({ theme }) => theme.space[1]}px;
`;

/** Row of cells — gap/cell size are measured values passed in from the grid. */
export const Row = styled.View<{ $gap: number; $height: number }>`
  flex-direction: row;
  gap: ${({ $gap }) => $gap}px;
  height: ${({ $height }) => $height}px;
  margin-bottom: ${({ $gap }) => $gap}px;
`;
