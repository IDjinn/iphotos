import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill } from '@/theme/shared';

export const TopBar = styled(Animated.View)<{ $insetTop: number }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-top: ${({ $insetTop }) => $insetTop}px;
`;

export const Title = styled(ThemedText)`
  flex: 1;
  text-align: center;
  margin-horizontal: ${({ theme }) => theme.space[2]}px;
  text-shadow-color: rgba(0, 0, 0, 0.5);
  text-shadow-offset: 0px 1px;
  text-shadow-radius: 6px;
`;

export const BottomBar = styled(Animated.View)<{ $insetBottom: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-bottom: ${({ $insetBottom }) => $insetBottom}px;
`;

export const Scrim = styled.View`
  ${absoluteFill}
  background-color: rgba(0, 0, 0, 0.25);
`;

export const Spacer = styled.View`
  flex: 1;
`;

export const IconButton = styled(Pressable)`
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
`;
