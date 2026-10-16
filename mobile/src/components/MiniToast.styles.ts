import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { elevationLow } from '@/theme/shared';

export const Wrap = styled(Animated.View)<{ $top: number }>`
  ${elevationLow}
  position: absolute;
  align-self: center;
  top: ${({ $top }) => $top}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surfaceElevated};
`;

export const Text = styled(ThemedText)`
  max-width: ${({ theme }) => theme.ms(280)}px;
`;
