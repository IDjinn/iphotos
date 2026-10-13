import styled from 'styled-components/native';

/** Skeleton twin of the `CloudPhotoGrid` geometry — edge-to-edge rows of
 * square cells separated by the same 1px cell padding, so the swap into the
 * real list does not shift the layout. */

export const Grid = styled.View`
  flex: 1;
`;

export const GridRow = styled.View`
  flex-direction: row;
`;

export const GridCell = styled.View<{ $columns: number }>`
  flex: ${({ $columns }) => 1 / $columns};
  aspect-ratio: 1;
  padding: 1px;
`;
