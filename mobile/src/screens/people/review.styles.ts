import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';

/** Review-suggestions page (`/people/review`, doc 18 §7.4) — page chrome is
 * reused from `screens/people.styles`; these are the page's own pieces. */

/** Section heading above the "same person?" merge-group cards. */
export const SectionTitle = styled(ThemedText)`
  margin-top: ${({ theme }) => theme.space[1]}px;
`;

/** Loading twin of a suggestion card: face strip + copy lines. */
export const SkeletonCard = styled.View`
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const SkeletonMeta = styled.View`
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]}px;
`;
