import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

export const PadWrap = styled(Animated.View)`
  align-items: center;
`;

export const Grid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  width: ${({ theme }) => theme.ms(264)}px;
  gap: ${({ theme }) => theme.space[4]}px;
  justify-content: center;
`;

export const Key = styled(Pressable)`
  width: ${({ theme }) => theme.ms(72)}px;
  height: ${({ theme }) => theme.ms(72)}px;
  align-items: center;
  justify-content: center;
`;

export const KeySpacer = styled.View`
  width: ${({ theme }) => theme.ms(72)}px;
  height: ${({ theme }) => theme.ms(72)}px;
`;

export const DigitKey = styled(Key)<{ $pressed: boolean }>`
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed }) => ($pressed ? 0.6 : 1)};
`;

export const DotsWrap = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[3]}px;
  height: ${({ theme }) => theme.ms(16)}px;
  align-items: center;
`;

export type DotState = 'filled' | 'error' | 'empty';

export const Dot = styled.View<{ $state: DotState }>`
  width: ${({ theme }) => theme.ms(12)}px;
  height: ${({ theme }) => theme.ms(12)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme, $state }) =>
    $state === 'filled'
      ? theme.colors.accent
      : $state === 'error'
        ? theme.colors.danger
        : theme.colors.outline};
`;
