import styled from "styled-components";

export const JobHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  .meta {
    min-width: 0;
    display: flex;
    flex-direction: column;

    strong {
      font-size: 0.9375rem;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      font-size: 0.8125rem;
      color: var(--muted-foreground);
      line-height: 1.4;
    }
  }
`;

export const SectionLabel = styled.h2`
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
`;

export const CounterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;

  @media (min-width: 40rem) {
    grid-template-columns: repeat(5, 1fr);
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);

    strong {
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.01em;
    }

    span {
      font-size: 0.75rem;
      color: var(--muted-foreground);
      line-height: 1.4;
    }

    small {
      display: block;
      font-size: 0.6875rem;
      color: var(--muted-foreground);
      line-height: 1.4;
    }
  }
`;

export const Hint = styled.p`
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--muted-foreground);
`;

