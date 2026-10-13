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

/** Inset so the whole crop FITS the circle (contain) instead of the face
 * filling it edge-to-edge — the placeholder ring reads as breathing room. */
export const FaceImage = styled(Image)`
  position: absolute;
  top: 12%;
  right: 12%;
  bottom: 12%;
  left: 12%;
`;
