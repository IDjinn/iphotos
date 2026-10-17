import styled from 'styled-components/native';

export const Grid = styled.View`
  flex: 1;
`;

/** Covers the grid while a rebased window loads, hiding the stale photos. */
export const JumpOverlay = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.background};
`;
