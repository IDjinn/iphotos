import { Pressable, ScrollView, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled(ScrollView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: 52px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const HeaderSpacer = styled.View`
  width: 24px;
`;

export const Section = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  margin-top: ${({ theme }) => theme.space[5]}px;
`;

export const SectionTitle = styled(ThemedText)`
  margin-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const SectionHint = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[2]}px;
`;

/** Tappable settings row — dims when disabled, lightens feedback on press. */
export const Row = styled(Pressable)<{ $pressed: boolean; $dimmed?: boolean; $spaced?: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme, $spaced }) => ($spaced ? theme.space[2] : 0)}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed, $dimmed }) => ($pressed ? 0.75 : $dimmed ? 0.6 : 1)};
`;

/** Non-interactive settings row (switches, static info). */
export const StaticRow = styled.View<{ $spaced?: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme, $spaced }) => ($spaced ? theme.space[2] : 0)}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const RowText = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const RowLabel = styled(ThemedText)`
  flex: 1;
`;

export const ThemeRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const ThemeOption = styled(Pressable)<{ $active: boolean }>`
  flex: 1;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  border-width: ${({ theme }) => theme.border.thick}px;
  border-color: ${({ theme, $active }) => ($active ? theme.colors.accent : 'transparent')};
  background-color: ${({ theme, $active }) => ($active ? theme.colors.accentSoft : theme.colors.surface)};
`;

export const CacheInput = styled(TextInput)`
  width: 72px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-radius: ${({ theme }) => theme.radius.sm}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  text-align: right;
  font-size: ${({ theme }) => theme.type.size.bodySmall}px;
  color: ${({ theme }) => theme.colors.text};
  border-color: ${({ theme }) => theme.colors.outline};
`;

export const BackupBarTrack = styled.View`
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  flex-direction: row;
  margin-top: ${({ theme }) => theme.space[1]}px;
  background-color: rgba(128, 128, 128, 0.25);
`;

export const BackupBarFill = styled.View<{ $flex: number }>`
  border-radius: ${({ theme }) => theme.radius.full}px;
  flex: ${({ $flex }) => $flex};
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const License = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[3]}px;
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
`;
