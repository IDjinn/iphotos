import { TextInput } from 'react-native';
import { Image } from 'expo-image';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

/** People list (doc 18 §10) — paged card grid + search/filter toolbar +
 * "New faces" review section. */

export const Screen = styled.View<{ $insetTop?: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Header = styled.View`
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

// ── Toolbar: search input + All/Named/Unnamed chips ─────────────────────────

export const Toolbar = styled.View`
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const SearchBar = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  height: ${({ theme }) => theme.ms(44)}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const SearchInput = styled(TextInput)`
  flex: 1;
  font-size: ${({ theme }) => theme.type.size.body}px;
  padding-vertical: 0px;
  color: ${({ theme }) => theme.colors.text};
`;

export const FilterRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const FilterChip = styled(PressableScale)<{ $selected: boolean }>`
  flex: 1;
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  border-width: ${({ theme, $selected }) => ($selected ? 0 : theme.border.width)}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.accent : theme.colors.surface};
`;

export const FilterChipLabel = styled(ThemedText)<{ $selected: boolean }>`
  color: ${({ theme, $selected }) => ($selected ? theme.colors.onAccent : theme.colors.textSecondary)};
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const ResultCount = styled(ThemedText)`
  padding-horizontal: ${({ theme }) => theme.space[1]}px;
`;

export const Center = styled.View<{ $insetTop?: number }>`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[6]}px;
`;

/** Constraint for the paged people grid — the typed RN FlatList fills it. */
export const ListArea = styled.View`
  flex: 1;
`;

export const PersonCard = styled(PressableScale)`
  flex: 1;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const PersonCardAvatar = styled.View`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

/** Inset + contain: the face crop fits the circle with visible breathing room
 * instead of pressing against the edge. */
export const PersonCardImage = styled(Image)`
  position: absolute;
  top: 12%;
  right: 12%;
  bottom: 12%;
  left: 12%;
`;

/** Pending-review dot, top-right of the card with a background ring. */
export const PersonBadgeDot = styled.View`
  position: absolute;
  top: ${({ theme }) => theme.ms(10)}px;
  right: ${({ theme }) => theme.ms(10)}px;
  width: ${({ theme }) => theme.ms(12)}px;
  height: ${({ theme }) => theme.ms(12)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.accent};
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.surface};
`;

export const PersonName = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.medium};
  text-align: center;
`;

export const PersonCount = styled(ThemedText)`
  text-align: center;
`;

export const PersonGroupLine = styled(ThemedText)`
  text-align: center;
`;

// ── Review suggestions (doc 18 §7.4) ────────────────────────────────────────

/** Compact toolbar row for the pending "New faces" queue — the cards live in
 * a bottom sheet so the grid never gets pushed down when suggestions load.
 * Renders immediately in a loading state while the (slow) suggestions
 * endpoint works, so the affordance never pops in late. */
export const ReviewSuggestionsButton = styled(PressableScale)<{ $loading?: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.accent};
  background-color: ${({ theme }) => theme.colors.accentSoft};
  opacity: ${({ $loading }) => ($loading ? 0.6 : 1)};
`;

export const ReviewSuggestionsLabel = styled(ThemedText)`
  flex: 1;
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

/** Skeleton twin of the cycling face strip — three overlapping crops. */
export const LoadingStrip = styled.View`
  flex-direction: row;
`;

export const LoadingStripItem = styled.View<{ $first?: boolean }>`
  margin-left: ${({ $first, theme }) => ($first ? 0 : -theme.ms(10))}px;
`;


export const ReviewSheetContent = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const ReviewSheetEmpty = styled(ThemedText)`
  text-align: center;
  padding: ${({ theme }) => theme.space[4]}px;
`;

// ── Skeleton (initial load) lives in `components/skeleton/` ────────────────

export const RetryButton = styled(PressableScale)`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.accent};
`;
