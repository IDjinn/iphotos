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

/** Cover fills the whole circle — the server-side crop already carries the
 * face padding (Ml:FaceCropPadding), so the face stays comfortably framed. */
export const FaceImage = styled(Image)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;
