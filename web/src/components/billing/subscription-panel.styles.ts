import styled from "styled-components";

export const PlanRow = styled.div`
  display: flex;
  align-items: center;
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
    }

    span {
      font-size: 0.8125rem;
      color: var(--muted-foreground);
      line-height: 1.4;
    }
  }
`;

export const UsageBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  .labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
`;
