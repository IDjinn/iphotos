import styled from "styled-components";
import { breakpoint } from "@/styles/shared";

export const PersonHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  flex-wrap: wrap;

  ${breakpoint.lg} {
    padding: 1.5rem 2rem 0.75rem;
  }
`;

export const PersonTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  margin-right: auto;

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const PersonSubtitle = styled.span`
  font-size: 0.8125rem;
  color: var(--muted-foreground);
`;

export const PersonActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

/** "Same person?" review banner above the photo grid (doc 18 §7.4): the review
 * lives inside the person's page, so the hub grid stays a uniform circle grid. */
export const ReviewBanner = styled.section`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0 1rem 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);

  ${breakpoint.lg} {
    margin: 0 2rem 0.75rem;
  }
`;

/** Overlapping circle row for a review banner's faces. */
export const ReviewBannerFaces = styled.div`
  display: flex;
  align-items: center;

  & > * + * {
    margin-left: -0.75rem;
  }

  & > * {
    box-shadow: 0 0 0 2px var(--background);
  }
`;

export const ReviewBannerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  margin-right: auto;

  strong {
    font-size: 0.875rem;
    font-weight: 500;
  }

  span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
`;

export const ReviewBannerActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

/** One-by-one review stepper (doc 18 §7.4): the person as reference on one side,
 * a single candidate on the other — enough detail to actually judge. */
export const ReviewStep = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 1.5rem;
`;

export const ReviewStepFigure = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  max-width: 10rem;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  text-align: center;

  > span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const ReviewProgress = styled.div`
  height: 0.25rem;
  border-radius: 9999px;
  background: var(--muted);
  overflow: hidden;
`;

export const ReviewProgressFill = styled.div<{ $value: number }>`
  width: 100%;
  height: 100%;
  background: var(--primary);
  transform: scaleX(${(props) => Math.min(1, Math.max(0, props.$value))});
  transform-origin: left;
`;

/** Group-coherence readout under the header: how tight this person's faces are
 * (mean member-to-centroid similarity from the backend, 0..1). */
export const ConfidenceBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem 0.75rem;

  ${breakpoint.lg} {
    padding: 0 2rem 0.75rem;
  }

  > span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  > strong {
    font-size: 0.75rem;
    font-weight: 600;
    min-width: 2.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;

export const ConfidenceTrack = styled.div`
  flex: 1;
  max-width: 16rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: var(--muted);
  overflow: hidden;
`;

export const ConfidenceFill = styled.div<{ $value: number }>`
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  transform: scaleX(${(props) => Math.min(1, Math.max(0, props.$value))});
  transform-origin: left;
  transition: transform 300ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const MergeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 22rem;
  overflow-y: auto;
`;

export const MergeOption = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  text-align: left;

  &:hover {
    background: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const MergeOptionMeta = styled.span`
  display: flex;
  flex-direction: column;
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
  }
`;
