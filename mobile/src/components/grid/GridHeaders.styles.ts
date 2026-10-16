import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

/** Minimal theme shape needed by the header height helpers below. */
interface HeaderTheme {
  space: readonly number[];
  type: { line: { title: number; small: number } };
}

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
  line-height: ${({ theme }) => theme.type.line.title}px;
`;

export const DayWrap = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[2]}px;
  padding-bottom: ${({ theme }) => theme.space[1]}px;
`;

export const DayLabel = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
`;

/** Row of cells — gap/cell size are measured values passed in from the grid. */
export const Row = styled.View<{ $gap: number; $height: number }>`
  flex-direction: row;
  gap: ${({ $gap }) => $gap}px;
  height: ${({ $height }) => $height}px;
  margin-bottom: ${({ $gap }) => $gap}px;
`;

/** Exact rendered MonthWrap height — mirrors its paddings + label line box. */
export const monthHeaderHeight = ({ space, type }: HeaderTheme): number =>
  space[2] * 2 + type.line.title;

/** Exact rendered DayWrap height — mirrors its paddings + label line box. */
export const dayHeaderHeight = ({ space, type }: HeaderTheme): number =>
  space[2] + space[1] + type.line.small;
