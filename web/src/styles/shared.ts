import { css } from "styled-components";

// Breakpoints — mobile-first, in rem so they respond to text-size settings too.
// Defined once; never scatter magic numbers across style files.
export const breakpoint = {
  sm: "@media (min-width: 40rem)",
  md: "@media (min-width: 48rem)",
  lg: "@media (min-width: 64rem)",
  xl: "@media (min-width: 80rem)",
} as const;

// Visible keyboard focus for custom interactive surfaces (shadcn primitives ship
// their own ring; use this on styled wrappers that are focusable).
export const focusRing = css`
  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

// Press feedback (Romero ui.md): scale on :active, ~100–160ms ease-out.
export const pressScale = css`
  transition: transform var(--duration-fast) var(--ease-out);

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    transform: none;
  }
`;

// Hover color/background shifts gated behind real hover-capable pointers.
export const hoverable = (styles: ReturnType<typeof css>) => css`
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${styles}
    }
  }
`;

// Gentle reduced-motion variant: keep opacity/color, drop movement.
export const reducedMotion = css`
  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;

    *,
    & {
      animation-duration: 1ms;
      animation-iteration-count: 1;
    }
  }
`;
