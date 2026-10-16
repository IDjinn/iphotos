import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import { absoluteFill, elevationMedium } from '@/theme/shared';

export const Root = styled(Animated.View)`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${({ theme }) => theme.space[6]}px;
`;

export const Backdrop = styled(Animated.View)`
  ${absoluteFill}
  background-color: ${({ theme }) => theme.colors.backdrop};
`;

export const BackdropPressable = styled.Pressable`
  flex: 1;
`;

export const Card = styled(Animated.View)`
  ${elevationMedium}
  width: 100%;
  max-width: ${({ theme }) => theme.ms(320)}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.glassBorder};
  background-color: ${({ theme }) => theme.colors.glassFill};
  overflow: hidden;
`;

/** Simulated specular highlight along the card's top edge. */
export const Sheen = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: ${({ theme }) => theme.ms(1)}px;
  background-color: ${({ theme }) => theme.colors.glassHighlight};
  opacity: 0.6;
`;

export const Body = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const Title = styled(ThemedText)`
  text-align: center;
`;

export const Message = styled(ThemedText)`
  text-align: center;
`;

export const Actions = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[4]}px;
`;

export const ActionBase = styled(Animated.View)`
  flex: 1;
  border-radius: ${({ theme }) => theme.radius.md}px;
  overflow: hidden;
`;

export const ActionPressable = styled.Pressable<{ $destructive: boolean }>`
  align-items: center;
  justify-content: center;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme, $destructive }) =>
    $destructive ? theme.colors.danger : theme.colors.glassButton};
  opacity: 0.85;

  :pressed {
    opacity: 0.55;
  }
`;

export const ActionLabel = styled(ThemedText)<{ $destructive: boolean }>`
  color: ${({ theme, $destructive }) => ($destructive ? theme.colors.textInverse : theme.colors.text)};
`;
