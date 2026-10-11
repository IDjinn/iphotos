import styled from "styled-components";

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(0 0 0 / 0.92);
  animation: viewer-fade-in var(--duration-base) var(--ease-out);

  @keyframes viewer-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1ms;
  }
`;

export const Content = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
`;

export const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  color: white;
  flex-shrink: 0;
`;

export const Caption = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: auto;

  strong {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    font-size: 0.75rem;
    color: rgb(255 255 255 / 0.7);
    line-height: 1.4;
  }
`;

export const Stage = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  /* A definite area: percentage max-sizes on the photo resolve against the
   * stage (not the image's natural size), so it always fits the screen. */
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  padding: 1rem;
`;

export const StageSkeleton = styled.div`
  width: min(80vw, 60rem);
  height: 60%;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.08);
  animation: viewer-fade-in 2s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.5;
  }
`;

export const Photo = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm);
  animation: viewer-zoom-in var(--duration-slow) var(--ease-out);

  @keyframes viewer-zoom-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: viewer-fade-in var(--duration-fast) ease;
  }
`;

export const Video = styled.video`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm);
  animation: viewer-zoom-in var(--duration-slow) var(--ease-out);

  @media (prefers-reduced-motion: reduce) {
    animation: viewer-fade-in var(--duration-fast) ease;
  }
`;

/** Live Photo motion surface — swaps in for the still while playing/scrubbing. */
export const LiveVideo = styled.video`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm);
  animation: viewer-fade-in var(--duration-fast) ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** "LIVE" marker pill (iOS Photos): click toggles the motion playback. */
export const LivePill = styled.button<{ $playing: boolean }>`
  position: absolute;
  top: 0.75rem;
  left: 1rem;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: ${({ $playing }) => ($playing ? "var(--primary-foreground)" : "white")};
  background: ${({ $playing }) =>
    $playing ? "var(--primary)" : "color-mix(in oklab, var(--background) 60%, transparent)"};
  backdrop-filter: blur(4px);
  transition:
    background-color var(--duration-fast) ease,
    transform var(--duration-fast) var(--ease-out);

  span[aria-hidden] {
    width: 0.625rem;
    height: 0.625rem;
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
  }
`;

/** Bottom-left stage tool (frames strip trigger) — mirrors StageButton placement. */
export const StageTool = styled.button`
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  z-index: 5;
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: white;
  background: rgb(255 255 255 / 0.12);
  backdrop-filter: blur(4px);
  transition: background-color var(--duration-fast) ease;

  &[aria-pressed="true"] {
    background: rgb(255 255 255 / 0.22);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgb(255 255 255 / 0.22);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const StageButton = styled.button<{ $side: "left" | "right" }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: 1rem;
  transform: translateY(-50%);
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: white;
  background: rgb(255 255 255 / 0.12);
  backdrop-filter: blur(4px);
  transition: background-color var(--duration-fast) ease;

  &:disabled {
    opacity: 0;
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.22);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const IconButton = styled.button`
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  cursor: pointer;
  color: white;
  background: transparent;
  transition: background-color var(--duration-fast) ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.15);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const DestructiveIconButton = styled(IconButton)`
  color: color-mix(in oklab, var(--destructive) 75%, white);

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: color-mix(in oklab, var(--destructive) 25%, transparent);
    }
  }
`;
