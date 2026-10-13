import { TextInput } from 'react-native';
import styled from 'styled-components/native';

/** Reuses the ConfirmDialog chrome (glass card, actions) — only the text
 * input is its own. */

export const Input = styled(TextInput)`
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.type.size.body}px;
  color: ${({ theme }) => theme.colors.text};
`;
