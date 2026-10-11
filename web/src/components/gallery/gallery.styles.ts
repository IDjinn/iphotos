import styled from "styled-components";
import { breakpoint } from "@/styles/shared";

export const GalleryHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  flex-wrap: wrap;

  ${breakpoint.lg} {
    padding: 1.5rem 2rem 0.75rem;
  }

  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.1;
    margin-right: auto;
  }
`;

export const CountLabel = styled.span`
  font-size: 0.875rem;
  color: var(--muted-foreground);
  line-height: 1.5;
`;

export const GridScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 1rem 2rem;

  ${breakpoint.lg} {
    padding: 0.25rem 2rem 3rem;
  }
`;

export const GalleryBody = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const MonthRailTrack = styled.div`
  position: absolute;
  right: 0.375rem;
  top: 1rem;
  bottom: 1rem;
  width: 1.5rem;
  z-index: 20;
  display: flex;
  justify-content: flex-end;
  touch-action: none;
  cursor: grab;

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  &:active {
    cursor: grabbing;
  }
`;

export const MonthRailThumb = styled.div<{ $active: boolean }>`
  width: 0.3rem;
  height: 2.5rem;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "var(--primary)" : "var(--border)")};
  transition: background var(--duration-fast) ease;
  will-change: transform;
`;

export const MonthRailBubble = styled.div<{ $visible: boolean }>`
  position: absolute;
  right: 1.875rem;
  top: 0;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  transform: translateY(-50%);
  pointer-events: none;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity var(--duration-fast) var(--ease-out);
`;

export const GridInner = styled.div`
  position: relative;
  width: 100%;
`;

export const GridRow = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
`;

export const CellWrap = styled.div`
  position: relative;
  flex-shrink: 0;
  margin-right: 0.25rem;
  margin-bottom: 0.25rem;
`;

export const CellButton = styled.button`
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: zoom-in;
  background: var(--muted);
  transition: transform var(--duration-fast) var(--ease-out);

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: scale(0.985);
    }
  }
`;

export const SelectButton = styled.button<{ $selected: boolean; $visible: boolean }>`
  position: absolute;
  top: 0.375rem;
  left: 0.375rem;
  width: 1.75rem;
  height: 1.75rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: var(--foreground);
  background: color-mix(in oklab, var(--background) 55%, transparent);
  backdrop-filter: blur(4px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-fast) var(--ease-out);

  &:focus-visible {
    outline: 2px solid var(--ring);
  }

  &[aria-pressed="true"] {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  &:active {
    transform: scale(0.92);
  }
`;

export const CellBadge = styled.span`
  position: absolute;
  bottom: 0.375rem;
  right: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1;
  padding: 0.25rem 0.375rem;
  border-radius: calc(var(--radius) - 4px);
  background: color-mix(in oklab, var(--background) 70%, transparent);
  color: var(--foreground);
  backdrop-filter: blur(4px);
`;

export const VideoBadge = styled.span`
  position: absolute;
  bottom: 0.375rem;
  right: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1;
  padding: 0.25rem 0.375rem;
  border-radius: calc(var(--radius) - 4px);
  background: color-mix(in oklab, var(--background) 70%, transparent);
  color: var(--foreground);
  backdrop-filter: blur(4px);

  svg {
    width: 0.75rem;
    height: 0.75rem;
  }
`;

/** iPhone Live Photo marker (concentric rings), mirroring the mobile grid badge. */
export const LiveBadge = styled(VideoBadge)``;

export const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.25rem;
  padding: 0.25rem 1rem 2rem;

  ${breakpoint.lg} {
    padding: 0.25rem 2rem 3rem;
  }
`;

export const StatusArea = styled.div`
  flex: 1;
  min-height: 50vh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
`;

export const StatusBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  max-width: 26rem;

  svg {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--muted-foreground);
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.2;
  }

  p {
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }
`;

export const SelectionBar = styled.div`
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);

  span {
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0 0.375rem;
  }
`;
