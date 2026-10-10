import styled from "styled-components";

export const PersonHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  flex-wrap: wrap;
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
