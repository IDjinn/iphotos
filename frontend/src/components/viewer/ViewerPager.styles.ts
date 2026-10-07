import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

export const PagerContainer = styled(Animated.View)`
  flex: 1;
`;

/** One page of the pager — left offset and width arrive as transient props. */
export const Page = styled.View<{ $left: number; $width: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left}px;
  width: ${({ $width }) => $width}px;
`;
