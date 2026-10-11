import styled from 'styled-components/native';

/** Overlapping face strip — negative margin stacks the avatars, the first item
 * sits flush; every avatar gets a background-colored ring so overlaps read. */

export const Strip = styled.View`
  flex-direction: row;
  align-items: center;
`;

export const StripItem = styled.View<{ $first: boolean; $size: number }>`
  margin-left: ${({ theme, $first }) => ($first ? 0 : -theme.ms(10))}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.background};
`;

export const ChipPill = styled.View<{ $size: number }>`
  width: ${({ theme, $size }) => theme.ms($size)}px;
  height: ${({ theme, $size }) => theme.ms($size)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;
