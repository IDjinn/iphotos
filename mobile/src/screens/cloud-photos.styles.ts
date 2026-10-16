import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View<{ $insetTop: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => $insetTop}px;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: ${({ theme }) => theme.ms(52)}px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const HeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;
