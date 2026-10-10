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

export const PeopleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
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

export const SectionTitle = styled.h2`
  padding: 1rem 1rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;

  ${breakpoint.lg} {
    padding: 1rem 2rem 0.5rem;
  }
`;

/**
 * Review card living in the person's own grid slot (doc 18 §10): the person's
 * avatar next to the candidate faces, the question, and the actions. Spans two
 * columns so the strip and buttons fit without squeezing the tiles.
 */
export const ReviewCard = styled.div`
  grid-column: span 2;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
`;

/** Overlapping circle row for a review card's faces. */
export const ReviewFaces = styled.div`
  display: flex;
  align-items: center;

  & > * + * {
    margin-left: -0.75rem;
  }

  & > * {
    box-shadow: 0 0 0 2px var(--background);
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

export const ReviewInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;

  strong {
    font-size: 0.875rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
`;

export const ReviewActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;
