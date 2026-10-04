import styled, { keyframes } from "styled-components";

// Skeleton pulse: opacity-only constant motion; reduced motion renders a
// static dimmed placeholder.
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export const Frame = styled.div<{ $ratio?: number; $fill?: boolean }>`
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--muted);
  width: 100%;
  ${({ $fill, $ratio }) =>
    $fill
      ? "height: 100%; aspect-ratio: auto;"
      : `aspect-ratio: ${$ratio ? `${$ratio}` : "1"};`}
`;

export const SkeletonFill = styled.div`
  position: absolute;
  inset: 0;
  background: var(--muted);
  animation: ${pulse} 2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.6;
  }
`;

export const Photo = styled.img<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity var(--duration-base) var(--ease-out);
`;

export const Unavailable = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted-foreground);
  background: var(--muted);
`;
