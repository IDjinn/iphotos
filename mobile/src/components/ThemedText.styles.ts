import { Text } from 'react-native';
import styled, { css } from 'styled-components/native';

export type Variant = 'display' | 'title' | 'titleMedium' | 'body' | 'bodySmall' | 'label';
export type Tone = 'primary' | 'secondary' | 'accent' | 'danger' | 'inverse' | 'textInverse';

const REGULAR_VARIANTS: readonly Variant[] = ['display', 'body', 'bodySmall'];

export const ThemedTextBase = styled(Text)<{ $variant: Variant; $tone: Tone }>`
  font-size: ${({ theme, $variant }) => theme.type.size[$variant]}px;
  font-weight: ${({ theme, $variant }) =>
    REGULAR_VARIANTS.includes($variant) ? theme.type.weight.regular : theme.type.weight.medium};
  color: ${({ theme, $tone }) =>
    $tone === 'secondary'
      ? theme.colors.textSecondary
      : $tone === 'accent'
        ? theme.colors.accent
        : $tone === 'danger'
          ? theme.colors.danger
          : $tone === 'inverse'
            ? theme.colors.background
            : $tone === 'textInverse'
              ? theme.colors.textInverse
              : theme.colors.text};
  ${({ $variant, theme }) =>
    $variant === 'label' &&
    css`
      letter-spacing: ${theme.type.letterSpacing.tight}px;
      text-transform: uppercase;
    `}
`;
