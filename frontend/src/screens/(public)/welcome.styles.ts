import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

export const Container = styled.View<{ $insetTop: number; $insetBottom: number }>`
  flex: 1;
  padding-horizontal: ${({ theme }) => theme.space[6]}px;
  padding-top: ${({ $insetTop }) => $insetTop}px;
  padding-bottom: ${({ $insetBottom }) => $insetBottom}px;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Hero = styled(Animated.View)`
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const Logo = styled.View`
  width: ${({ theme }) => theme.ms(96)}px;
  height: ${({ theme }) => theme.ms(96)}px;
  border-radius: ${({ theme }) => theme.radius.xl}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const Title = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
  letter-spacing: ${({ theme }) => theme.type.letterSpacing.slight}px;
`;

export const Tagline = styled(ThemedText)`
  text-align: center;
`;

export const Bullets = styled.View`
  gap: ${({ theme }) => theme.space[3]}px;
  align-self: stretch;
`;

export const BulletRow = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const BulletText = styled(ThemedText)`
  flex: 1;
`;

export const Actions = styled(Animated.View)`
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const PrimaryButton = styled(PressableScale)`
  height: ${({ theme }) => theme.ms(52)}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const SecondaryButton = styled(PressableScale)`
  height: ${({ theme }) => theme.ms(52)}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  justify-content: center;
  border-width: ${({ theme }) => theme.border.thick}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.surface};
`;
