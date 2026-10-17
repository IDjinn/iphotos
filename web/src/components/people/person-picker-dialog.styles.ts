import styled from "styled-components";

export const PickerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 50vh;
  overflow-y: auto;

  p {
    padding: 1rem 0;
    text-align: center;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
`;

export const PickerRow = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--radius-md);
  text-align: left;
  background: ${(props) => (props.$selected ? "var(--accent)" : "transparent")};

  &:hover {
    background: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

export const PickerRowText = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    font-weight: 500;
  }

  span {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
`;
