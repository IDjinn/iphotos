import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

/** "New faces" suggestion card (doc 18 §7.4) — full-width row on the hub. */

export const Card = styled(Animated.View)`
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const TopRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const Info = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const Title = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const Subtitle = styled(ThemedText)``;

export const ActionsRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
`;
