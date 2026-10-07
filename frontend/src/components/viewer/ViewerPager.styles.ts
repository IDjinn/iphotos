import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { SCREEN_WIDTH } from '@/theme/tokens';

export const PagerContainer = styled(Animated.View)`
  flex: 1;
`;

/** One page of the pager — left offset and width come from the measured screen. */
export const Page = styled.View<{ $left: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left}px;
  width: ${SCREEN_WIDTH}px;
`;
