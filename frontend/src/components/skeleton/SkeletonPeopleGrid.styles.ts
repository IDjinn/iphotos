import styled from 'styled-components/native';

/** Skeleton twin of the people-grid card geometry (`screens/people.styles.ts`):
 * same columns, gaps and card chrome, so the swap into the real grid does not
 * shift the layout. */

export const Grid = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-top: ${({ theme }) => theme.space[3]}px;
`;

export const GridRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const CardSlot = styled.View`
  flex: 1;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const AvatarSlot = styled.View`
  width: 100%;
  aspect-ratio: 1;
`;
