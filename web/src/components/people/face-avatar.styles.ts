import styled from "styled-components";

export const AvatarFrame = styled.div<{ $size: number }>`
  position: relative;
  width: ${({ $size }) => `${$size}px`};
  height: ${({ $size }) => `${$size}px`};
  border-radius: 9999px;
  overflow: hidden;
  background: var(--muted);
  flex-shrink: 0;
`;

export const AvatarImage = styled.img<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
`;

export const AvatarFallback = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
`;
