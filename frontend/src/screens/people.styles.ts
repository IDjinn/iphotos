import { Pressable } from 'react-native';
import { Image } from 'expo-image';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

/** People list (doc 18 §10) — paged card grid + "New faces" review section. */

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

export const PersonCardImage = styled(Image)`
  ${absoluteFill}
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

// ── New faces (suggestions, doc 18 §7.4) ───────────────────────────────────

export const NewFacesSection = styled.View`
  gap: ${({ theme }) => theme.space[3]}px;
  padding-top: ${({ theme }) => theme.space[3]}px;
`;

export const SectionTitle = styled(ThemedText)`
  padding-bottom: ${({ theme }) => theme.space[1]}px;
`;

// ── Skeleton (initial load) ────────────────────────────────────────────────

export const SkeletonGrid = styled.View`
  flex: 1;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px;
`;

export const SkeletonCard = styled.View`
  width: 30%;
  flex-grow: 1;
  aspect-ratio: 0.9;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surfaceElevated};
`;

export const RetryButton = styled(PressableScale)`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.accent};
`;
