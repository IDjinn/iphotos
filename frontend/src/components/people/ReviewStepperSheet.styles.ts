import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

/** One-by-one review stepper inside the bottom sheet (doc 18 §7.4). */

export const SheetHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
`;

export const SheetHeading = styled(ThemedText)`
  flex: 1;
  text-align: center;
`;

export const Description = styled(ThemedText)`
  text-align: center;
  padding-horizontal: ${({ theme }) => theme.space[5]}px;
  padding-top: ${({ theme }) => theme.space[2]}px;
`;

export const FiguresRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  gap: ${({ theme }) => theme.space[6]}px;
  padding-vertical: ${({ theme }) => theme.space[4]}px;
`;

export const Figure = styled.View`
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  max-width: ${({ theme }) => theme.ms(150)}px;
`;

export const FigureLabel = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[2]}px;
`;

export const FigureName = styled(ThemedText)`
  text-align: center;
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

export const FigureMeta = styled(ThemedText)`
  text-align: center;
`;

export const ProgressLabel = styled(ThemedText)`
  text-align: center;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
`;

export const ProgressTrack = styled.View`
  height: ${({ theme }) => theme.ms(6)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.placeholder};
  margin-horizontal: ${({ theme }) => theme.space[5]}px;
  overflow: hidden;
`;

/** Origin left so scaleX grows from the leading edge; transform-only motion. */
export const TrackFill = styled(Animated.View)`
  height: 100%;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.accent};
  transform-origin: left center;
`;

export const Footer = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[4]}px;
`;
