import { Pressable, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View<{ $insetTop?: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Center = styled.View<{ $insetTop?: number }>`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Header = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: ${({ theme }) => theme.ms(52)}px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

/** Spacer mirroring the leading icon so the centered title stays centered. */
export const HeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;

export const RenameInput = styled(TextInput)`
  flex: 1;
  border-width: ${({ theme }) => theme.border.width}px;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  font-size: ${({ theme }) => theme.type.size.titleMedium}px;
  font-weight: ${({ theme }) => theme.type.weight.medium};
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme }) => theme.colors.accent};
`;

export const CreateWrap = styled.View`
  padding: ${({ theme }) => theme.space[5]}px;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const CreateInput = styled(TextInput)`
  border-width: ${({ theme }) => theme.border.width}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.type.size.titleMedium}px;
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme }) => theme.colors.outline};
`;

export const CreateButton = styled(Pressable)<{ $enabled: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  align-items: center;
  background-color: ${({ theme, $enabled }) => ($enabled ? theme.colors.accent : theme.colors.surface)};
`;

export const CreateHint = styled(ThemedText)`
  text-align: center;
  padding-top: ${({ theme }) => theme.space[1]}px;
`;
