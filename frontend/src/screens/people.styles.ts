import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

/** People list (doc 18 §10) — Google-Photos-style circle grid. */

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

export const PeopleGrid = styled.ScrollView`
  flex: 1;
`;

export const PeopleWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  justify-content: center;
`;

/** Three circles per row, capped for wide screens. */
export const PersonCardWrap = styled(PressableScale)`
  width: 28%;
  max-width: ${({ theme }) => theme.ms(120)}px;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const PersonCircle = styled(Pressable)`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PersonCircleImage = styled(Image)`
  ${absoluteFill}
`;

export const PersonCircleIcon = styled.View`
  align-items: center;
  justify-content: center;
`;

export const PersonName = styled(ThemedText)`
  font-size: ${({ theme }) => theme.type.size.bodySmall}px;
  color: ${({ theme }) => theme.colors.text};
  text-align: center;
`;

export const PersonCount = styled(ThemedText)`
  font-size: ${({ theme }) => theme.type.size.bodySmall}px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
