import styled from "styled-components";

export const DropZone = styled.div<{ $dragging: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1.5px dashed ${({ $dragging }) => ($dragging ? "var(--ring)" : "var(--border)")};
  border-radius: var(--radius-lg);
  padding: 1rem;
  transition: border-color var(--duration-fast) ease, opacity var(--duration-fast) ease;

  ${({ $dragging }) => ($dragging ? "opacity: 0.85;" : "")}
`;

export const EmptyHint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  text-align: center;
  padding: 1.5rem 1rem;

  svg {
    width: 2rem;
    height: 2rem;
    color: var(--muted-foreground);
  }

  p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    line-height: 1.5;
  }
`;

export const TaskList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 18rem;
  overflow-y: auto;
`;

export const TaskRow = styled.li`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);

  .name {
    min-width: 0;
    display: flex;
    flex-direction: column;

    strong {
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      font-size: 0.75rem;
      color: var(--muted-foreground);
      line-height: 1.4;
    }
  }

  .state {
    display: grid;
    place-items: center;
    color: var(--muted-foreground);
  }

  &[data-status="done"] .state,
  &[data-status="duplicated"] .state {
    color: var(--primary);
  }

  &[data-status="error"] .state {
    color: var(--destructive);
  }
`;

export const RejectionNote = styled.p`
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--destructive);
  margin: 0;
`;
