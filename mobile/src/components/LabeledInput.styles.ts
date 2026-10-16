import { TextInput } from 'react-native';
import styled from 'styled-components/native';

export const Wrap = styled.View`
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const Field = styled(TextInput)<{ $error: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  border-width: ${({ theme }) => theme.border.thick}px;
  height: ${({ theme }) => theme.ms(48)}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.type.size.body}px;
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme, $error }) => ($error ? theme.colors.danger : 'transparent')};
`;
