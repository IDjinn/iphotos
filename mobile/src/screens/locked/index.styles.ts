import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

export const Screen = styled.View<{ $insetTop?: number }>`
  flex: 1;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Content = styled.View`
  flex: 1;
`;

export const Center = styled.View<{ $insetTop?: number }>`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-top: ${({ $insetTop }) => ($insetTop ?? 0)}px;
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  height: ${({ theme }) => theme.ms(52)}px;
`;

export const HeaderTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

/** Spacer mirroring the close icon so the centered title stays centered. */
export const HeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;

export const Flow = styled(Animated.View)`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[8]}px;
  gap: ${({ theme }) => theme.space[4]}px;
`;

export const LockIconWrap = styled.View<{ $soft: boolean }>`
  width: ${({ theme }) => theme.ms(76)}px;
  height: ${({ theme }) => theme.ms(76)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $soft }) => ($soft ? theme.colors.accentSoft : 'transparent')};
`;

export const FlowTitle = styled(ThemedText)`
  text-align: center;
`;

export const FlowText = styled(ThemedText)`
  text-align: center;
  max-width: ${({ theme }) => theme.ms(300)}px;
  line-height: ${({ theme }) => theme.type.line.body}px;
`;

export const PrimaryButton = styled(PressableScale)`
  border-radius: ${({ theme }) => theme.radius.xl}px;
  padding-horizontal: ${({ theme }) => theme.space[8]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const SecondaryButton = styled(PressableScale)`
  padding: ${({ theme }) => theme.space[2]}px;
`;

export const ButtonLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const UpgradeCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  margin-horizontal: ${({ theme }) => theme.space[4]}px;
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const UpgradeText = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const UpgradeButton = styled(PressableScale)`
  align-self: flex-start;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const UpgradeButtonLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;
