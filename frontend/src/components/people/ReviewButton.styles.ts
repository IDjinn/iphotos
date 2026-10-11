import styled from 'styled-components/native';

import { PressableScale } from '@/components/PressableScale';
import { ThemedText } from '@/components/ThemedText';

export type ReviewButtonVariant = 'primary' | 'outline' | 'ghost';

interface ShellProps {
  variant: ReviewButtonVariant;
  $destructive: boolean;
  $disabled: boolean;
}

/** Review button shells — filled accent, outlined accent, or borderless text.
 * Danger swaps accent for the destructive tone on every variant. */

export const ButtonShell = styled(PressableScale)<ShellProps>`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[1]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  background-color: ${({ theme, variant, $destructive }) =>
    variant === 'primary' && !$destructive ? theme.colors.accent : 'transparent'};
  border-width: ${({ theme, variant }) => (variant === 'outline' ? theme.border.width : 0)}px;
  border-color: ${({ theme, $destructive }) =>
    $destructive ? theme.colors.danger : theme.colors.accent};
`;

export const ButtonLabel = styled(ThemedText)<{ $variant: ReviewButtonVariant; $destructive: boolean }>`
  color: ${({ theme, $variant, $destructive }) => {
    if ($destructive) return theme.colors.danger;
    if ($variant === 'primary') return theme.colors.onAccent;
    if ($variant === 'outline') return theme.colors.accent;
    return theme.colors.textSecondary;
  }};
  font-weight: ${({ theme }) => theme.type.weight.medium};
`;

