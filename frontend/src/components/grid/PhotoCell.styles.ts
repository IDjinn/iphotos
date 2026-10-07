import { Image } from 'expo-image';
import { Pressable, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { absoluteFill } from '@/theme/shared';

export const DimLayer = styled(Animated.View)`
  ${absoluteFill}
`;

export const CellPressable = styled(Pressable)`
  ${absoluteFill}
`;

export const CellImage = styled(Image)`
  ${absoluteFill}
`;

/** Video indicator badge pinned to the cell's top-left corner. */
export const VideoBadge = styled.View`
  position: absolute;
  top: ${({ theme }) => theme.space[1]}px;
  left: ${({ theme }) => theme.space[1]}px;
  width: ${({ theme }) => theme.ms(22)}px;
  height: ${({ theme }) => theme.ms(22)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.scrim};
  align-items: center;
  justify-content: center;
`;

/** Duration label pinned to the cell's bottom edge (over media, theme-independent shadow). */
export const Duration = styled(Text)`
  position: absolute;
  bottom: ${({ theme }) => theme.space[1]}px;
  left: ${({ theme }) => theme.space[1]}px;
  color: ${({ theme }) => theme.colors.textInverse};
  font-size: ${({ theme }) => theme.type.size.caption}px;
  font-weight: ${({ theme }) => theme.type.weight.medium};
  text-shadow-color: rgba(0, 0, 0, 0.6);
  text-shadow-offset: 0px 1px;
  text-shadow-radius: 4px;
`;

export const CheckWrap = styled(Animated.View)`
  position: absolute;
  top: ${({ theme }) => theme.space[1]}px;
  right: ${({ theme }) => theme.space[1]}px;
  z-index: 10;
`;

export const CheckCircle = styled.View<{ $selected: boolean }>`
  width: ${({ theme }) => theme.ms(22)}px;
  height: ${({ theme }) => theme.ms(22)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  border-width: ${({ theme }) => theme.border.wide}px;
  border-color: ${({ theme }) => theme.colors.textInverse};
  background-color: ${({ theme, $selected }) => ($selected ? theme.colors.accent : 'rgba(0, 0, 0, 0.25)')};
  align-items: center;
  justify-content: center;
`;
