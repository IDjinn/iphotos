import { Image } from 'expo-image';
import { Pressable, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

/** Person detail (doc 18 §10) — header + photo grid of the person's photos. */

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

export const GridArea = styled.View`
  flex: 1;
`;

export const ActionsRow = styled.View`
  flex-direction: row;
  border-top-width: ${({ theme }) => theme.border.width}px;
  border-top-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.background};
`;

export const ActionButton = styled(Pressable)`
  flex: 1;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const ActionLabel = styled(ThemedText)``;

// ── Merge picker sheet ──────────────────────────────────────────────────────

export const MergeHeading = styled(ThemedText)`
  text-align: center;
  padding-bottom: ${({ theme }) => theme.space[3]}px;
`;

export const MergeList = styled.ScrollView`
  max-height: ${({ theme }) => theme.ms(360)}px;
`;

export const MergeRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $pressed }) => ($pressed ? theme.colors.surface : 'transparent')};
`;

export const MergeCircle = styled(Image)`
  width: ${({ theme }) => theme.ms(44)}px;
  height: ${({ theme }) => theme.ms(44)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

/** No-cover fallback: neutral circle with a person glyph. */
export const MergeCirclePlaceholder = styled.View`
  width: ${({ theme }) => theme.ms(44)}px;
  height: ${({ theme }) => theme.ms(44)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const MergeMeta = styled.View`
  flex: 1;
`;

export const MergeName = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const MergeEmpty = styled(ThemedText)`
  text-align: center;
  padding: ${({ theme }) => theme.space[4]}px;
`;
