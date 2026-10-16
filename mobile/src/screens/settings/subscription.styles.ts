import { Pressable, ScrollView } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

export const Screen = styled(ScrollView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
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

export const HeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;

export const Body = styled.View`
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
  padding-top: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const Card = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
  opacity: ${({ $pressed }) => ($pressed ? 0.75 : 1)};
`;

export const LoadingCard = styled.View`
  flex-direction: row;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const PlanCard = styled.View`
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding: ${({ theme }) => theme.space[3]}px;
  background-color: ${({ theme }) => theme.colors.accentSoft};
`;

export const PlanTitle = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const CardColumn = styled.View`
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  gap: ${({ theme }) => theme.space[2]}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const PlanHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`;

export const CardText = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const BenefitRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const CurrentBadge = styled.View`
  border-radius: ${({ theme }) => theme.radius.sm}px;
  border-width: ${({ theme }) => theme.border.thick}px;
  border-color: ${({ theme }) => theme.colors.accent};
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
`;

export const SubscribeButton = styled(Pressable)<{ $pressed: boolean }>`
  border-radius: ${({ theme }) => theme.radius.md}px;
  align-items: center;
  justify-content: center;
  padding-vertical: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme }) => theme.space[1]}px;
  background-color: ${({ theme }) => theme.colors.accent};
  opacity: ${({ $pressed }) => ($pressed ? 0.85 : 1)};
`;

export const SubscribeLabel = styled(ThemedText)`
  font-weight: ${({ theme }) => theme.type.weight.semibold};
`;

export const Note = styled(ThemedText)`
  line-height: ${({ theme }) => theme.type.line.small}px;
  text-align: center;
  margin-top: ${({ theme }) => theme.space[2]}px;
`;
