import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

/** Loading placeholders (ui.md): blocks matching the final layout that the
 * content swaps into. Pulse lives in `Skeleton.tsx`; these stay pure styles. */

export const PulseBox = styled(Animated.View)<{
  $width?: number | string;
  $height?: number;
  $radius: number;
  $fill?: boolean;
}>`
  ${({ $width }) => ($width === undefined ? '' : `width: ${typeof $width === 'number' ? `${$width}px` : $width};`)}
  ${({ $height }) => ($height === undefined ? '' : `height: ${$height}px;`)}
  ${({ $fill }) => ($fill ? 'flex: 1;' : '')}
  border-radius: ${({ $radius }) => $radius}px;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;
