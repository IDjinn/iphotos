import styled from "styled-components";
import { breakpoint } from "@/styles/shared";

/** The page's own scroll box (gallery convention): the header stays put. */
export const ReviewScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 1rem 2rem;

  ${breakpoint.lg} {
    padding: 0.25rem 2rem 3rem;
  }
`;

export const ReviewGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
`;

/** One suggestion: its faces, a few photos, and the decision. Off-screen cards
 * skip layout/paint; the reserved height keeps the scrollbar steady. */
export const SuggestionCard = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  content-visibility: auto;
  contain-intrinsic-size: auto 20rem;
`;

/** The card's preview as one big button: a click anywhere on it opens the
 * review modal. */
export const CardOpen = styled.button`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-md);

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 4px;
  }
`;

export const CardHeading = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;

  strong {
    font-size: 0.875rem;
    font-weight: 600;
  }

  span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
`;

/** Faces of the suggestion — wraps, so any cluster size fits. */
export const FaceStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

/** Sample photos behind the cluster, to judge "same person?" in context. */
export const PhotoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 9rem));
  gap: 0.25rem;
`;

export const PhotoCell = styled.div`
  position: relative;
  aspect-ratio: 1 / 1;
`;

/** A photo that opens the shared viewer (full preview, prev/next). */
export const PhotoButton = styled.button`
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  overflow: hidden;

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const DetailsLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
`;

export const CardActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

export const CaughtUp = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  text-align: center;

  p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
`;

export const ListFooter = styled.div`
  display: flex;
  justify-content: center;
  padding: 1.5rem 0 0;
`;
