import styled from "styled-components";

export const PeopleHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  flex-wrap: wrap;

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
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
  padding: 0.25rem 1rem 2rem;
`;

export const PersonTile = styled.button`
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
`;

export const SuggestionList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 1rem 2rem;
  list-style: none;
`;

export const SuggestionCard = styled.li`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
`;

/** Overlapping circle row for a suggestion's sample faces. */
export const SuggestionFaces = styled.div`
  display: flex;

  & > * + * {
    margin-left: -0.75rem;
  }

  & > * {
    box-shadow: 0 0 0 2px var(--background);
  }
`;

export const SuggestionInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;

  strong {
    font-size: 0.875rem;
    font-weight: 500;
  }

  span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
`;

export const SuggestionActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;
