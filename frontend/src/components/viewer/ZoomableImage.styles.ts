import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

export const ZoomFill = styled(Animated.View)`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

/** Overlaid note when no image source could load (e.g. photo not cached offline). */
export const UnavailableState = styled.View`
  position: absolute;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;
