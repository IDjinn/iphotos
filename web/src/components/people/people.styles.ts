import styled from "styled-components";
import { breakpoint } from "@/styles/shared";

export const PeopleHeader = styled.div`
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
  }
`;

export const CountLabel = styled.span`
  font-size: 0.8125rem;
  color: var(--muted-foreground);
`;

/** Paged content (grid + footer) — dims while a filter switch reloads the
 * window, since keepPreviousData keeps the previous list visible underneath. */
export const PeopleArea = styled.div<{ $dimmed?: boolean }>`
  opacity: ${(props) => (props.$dimmed ? 0.55 : 1)};
  transition: opacity 150ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** Retry affordance under the grid when a window fails to load — the sentinel
 * stops re-firing after an error, so recovery is explicit. */
export const GridFooter = styled.div`
  display: flex;
  justify-content: center;
  padding: 0 1rem 2rem;

  ${breakpoint.lg} {
    padding: 0 2rem 3rem;
  }
`;

/** The page's own scroll box (gallery convention): header stays put and the
 * virtualized rows scroll inside it. */
export const PeopleScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

/** Horizontal gutter shared with `PeopleGrid`, so virtual rows and the plain
 * grids below line up. */
export const PeopleRows = styled.div`
  padding: 0.25rem 1rem 1rem;

  ${breakpoint.lg} {
    padding: 0.25rem 2rem 1rem;
  }
`;

/** Sized to the virtualizer's total height; rows position inside it. */
export const PeopleRowsInner = styled.div`
  position: relative;
  width: 100%;
`;

/** One virtual row: a tile grid (people, plus the suggestion cell when side by side). */
export const PeopleRow = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
`;

/** Tile grid of a row. Column count follows the measured width. */
export const PeopleRowTiles = styled.div<{ $columns: number }>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columns}, minmax(0, 1fr));
  gap: 0.5rem;
  align-items: start;
`;

/** Section heading as a virtual row (the gutter comes from PeopleRows). */
export const RowTitle = styled.h2`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding: 1rem 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
`;

export const PeopleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.5rem;
  align-items: start;
  padding: 0.25rem 1rem 2rem;

  ${breakpoint.lg} {
    padding: 0.25rem 2rem 3rem;
  }
`;

export const PersonTile = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border-radius: var(--radius-md);
  text-align: center;

  &:hover {
    background: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

/** Loading twin of PersonTile — same padding/gap so the real tiles replace it
 * without shifting the grid. */
export const PersonTileSkeleton = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
`;

/** Pending-review dot on a person tile — the review itself lives inside the
 * person's page, so the hub grid stays a uniform circle grid (doc 18 §10). */
export const ReviewBadge = styled.span`
  position: absolute;
  top: 0.625rem;
  right: 0.875rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--primary);
`;

export const PersonTileName = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  color: var(--foreground);
`;

export const PersonTileCount = styled.span`
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

/** Deck tile — the box of a person tile (same padding/gap), so the stack of
 * suggestions takes exactly one grid cell. */
export const DeckTileBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border-radius: var(--radius-md);
`;

/** Click target over the stacked cards (opens the review). */
export const DeckStack = styled.button<{ $size: number }>`
  position: relative;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  border-radius: 9999px;

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 4px;
  }
`;

/** One suggestion card in the deck. Position (offset/scale/opacity/stacking)
 * comes inline from the cycle; only transform and opacity animate. */
export const DeckCard = styled.span`
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  box-shadow:
    0 0 0 2px var(--background),
    0 0 0 3px var(--border);
  transition:
    transform 300ms ease,
    opacity 300ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const SectionTitle = styled.h2`
  padding: 1rem 1rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;

  ${breakpoint.lg} {
    padding: 1rem 2rem 0.5rem;
  }
`;

/** Overflow chip closing a face strip ("+N more"). */
export const ReviewMore = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0 0.375rem;
  margin-left: -0.75rem;
  border-radius: 9999px;
  background: var(--muted);
  box-shadow: 0 0 0 2px var(--background);
  font-size: 0.6875rem;
  color: var(--muted-foreground);
`;
