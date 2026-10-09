import { Pressable } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Heading = styled(ThemedText)`
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-top: ${({ theme }) => theme.space[1]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const ActionRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  margin-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $pressed }) => ($pressed ? theme.colors.accentSoft : 'transparent')};
`;

export const ActionLabel = styled(ThemedText)<{ $danger: boolean }>`
  flex: 1;
  font-weight: ${({ theme }) => theme.type.weight.medium};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.danger : theme.colors.text)};
`;
