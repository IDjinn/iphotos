import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Container = styled(Animated.View)`
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[10]}px;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const IconWrap = styled.View`
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const Title = styled(ThemedText)`
  text-align: center;
`;

export const Subtitle = styled(ThemedText)`
  text-align: center;
  max-width: 260px;
`;
