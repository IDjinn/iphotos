import { Image } from 'expo-image';
import { Pressable, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

export const Heading = styled(ThemedText)`
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-top: ${({ theme }) => theme.space[1]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const NewRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  margin-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.accentSoft};
  opacity: ${({ $pressed }) => ($pressed ? 0.8 : 1)};
`;

export const NewLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const CreateRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[2]}px;
`;

export const Input = styled(TextInput)`
  flex: 1;
  border-width: ${({ theme }) => theme.border.width}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.type.size.body}px;
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme }) => theme.colors.outline};
`;

export const CreateButton = styled(Pressable)<{ $enabled: boolean; $pressed: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  justify-content: center;
  background-color: ${({ theme, $enabled }) => ($enabled ? theme.colors.accent : theme.colors.surface)};
  opacity: ${({ $pressed }) => ($pressed ? 0.85 : 1)};
`;

export const List = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const EmptyHint = styled(ThemedText)`
  text-align: center;
  padding-vertical: ${({ theme }) => theme.space[4]}px;
`;

export const AlbumRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

export const Cover = styled.View`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const CoverImage = styled(Image)`
  ${absoluteFill}
`;

export const AlbumMeta = styled.View`
  flex: 1;
`;
