import { Image } from 'expo-image';
import styled from 'styled-components/native';

import { absoluteFill } from '@/theme/shared';

/** "New faces" preview sheet (doc 18 §7.4): photo grid behind a suggestion,
 * opened from the card before the person is created. */

export const SheetContent = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
`;

export const TitleBlock = styled.View`
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const PreviewCell = styled.View`
  flex: 1;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.md}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PreviewImage = styled(Image)`
  ${absoluteFill}
`;
