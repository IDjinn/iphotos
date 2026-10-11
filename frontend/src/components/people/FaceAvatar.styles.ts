import { Image } from 'expo-image';
import styled from 'styled-components/native';

/** Face avatar (doc 18 §10) — circular face crop, theme-scaled by `$size`. */

export const Circle = styled.View<{ $size: number }>`
  width: ${({ theme, $size }) => theme.ms($size)}px;
  height: ${({ theme, $size }) => theme.ms($size)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const FaceImage = styled(Image)`
  width: 100%;
  height: 100%;
`;
