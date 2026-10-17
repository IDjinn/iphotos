import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

/** Overlay covering the whole grid — children opt into touches. */
export const Rail = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;

/** Right-edge touch zone driving the scrub gesture. */
export const Zone = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: ${({ theme }) => theme.ms(44)}px;
  align-items: flex-end;
  padding-top: ${({ theme }) => theme.space[3]}px;
  padding-right: ${({ theme }) => theme.ms(3)}px;
`;

export const Handle = styled(Animated.View)<{ $height: number; $active: boolean }>`
  width: ${({ theme }) => theme.ms(6)}px;
  height: ${({ $height }) => $height}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme, $active }) => ($active ? theme.colors.accent : theme.colors.outline)};
`;

/** Month/year label pinned beside the rail at its timeline position. */
export const TickLayer = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;

export const Tick = styled.Text<{ $top: number }>`
  position: absolute;
  top: ${({ $top }) => $top}px;
  right: ${({ theme }) => theme.ms(16)}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.ms(2)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.backdrop};
  font-size: ${({ theme }) => theme.type.size.label}px;
  color: ${({ theme }) => theme.colors.text};
`;

/** Month preview pill shown while scrubbing, left of the rail. */
export const Bubble = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: ${({ theme }) => theme.ms(48)}px;
  background-color: ${({ theme }) => theme.colors.scrimSolid};
  border-radius: ${({ theme }) => theme.radius.full}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;
