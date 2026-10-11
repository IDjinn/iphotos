import { View } from 'react-native';
import { VideoView } from 'expo-video';
import styled from 'styled-components/native';

import { absoluteFill } from '@/theme/shared';

/** Page-level container so the gesture detector, surface and chip share bounds. */
export const LivePageWrap = styled(View)`
  ${absoluteFill}
`;

/** Motion clip surface — fills the page and frames the clip exactly over the
 * still (same sensor aspect, `contain` fit; the still shows through the bars). */
export const LiveSurface = styled(VideoView)`
  ${absoluteFill}
`;

/** Wraps the page so the LIVE chip centers above the chrome bar. */
export const PillWrap = styled(View)<{ $bottom: number }>`
  position: absolute;
  left: 0;
  right: 0;
  bottom: ${({ $bottom }) => $bottom}px;
  align-items: center;
`;

export const LivePill = styled.Pressable<{ $active: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  padding-horizontal: ${({ theme }) => theme.space[2]}px;
  padding-vertical: ${({ theme }) => theme.space[1]}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.accent : theme.colors.scrim};
`;

export const PillText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) => ($active ? theme.colors.onAccent : theme.colors.textInverse)};
  font-size: ${({ theme }) => theme.type.size.caption}px;
  font-weight: ${({ theme }) => theme.type.weight.semibold};
  letter-spacing: 0.08em;
`;
