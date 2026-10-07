import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { absoluteFill } from '@/theme/shared';

export const Root = styled.View`
  ${absoluteFill}
`;

export const Backdrop = styled(Animated.View)`
  ${absoluteFill}
  background-color: ${({ theme }) => theme.colors.backdrop};
`;

export const BackdropPressable = styled(Pressable)`
  ${absoluteFill}
`;

export const Sheet = styled(Animated.View)<{ $maxHeight: string; $paddingBottom: number }>`
  ${absoluteFill}
  top: auto;
  border-top-left-radius: ${({ theme }) => theme.radius.xl}px;
  border-top-right-radius: ${({ theme }) => theme.radius.xl}px;
  overflow: hidden;
  max-height: ${({ $maxHeight }) => $maxHeight};
  padding-bottom: ${({ $paddingBottom }) => $paddingBottom}px;
  background-color: ${({ theme }) => theme.colors.surfaceElevated};
`;

export const HandleWrap = styled.View`
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const Handle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background-color: ${({ theme }) => theme.colors.outline};
`;
