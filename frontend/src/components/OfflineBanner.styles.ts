import styled from 'styled-components/native';

/** Slim persistent notice shown above cloud galleries while offline. */
export const BannerWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  margin-horizontal: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;
