import Link from "next/link";
import styled from "styled-components";
import { breakpoint } from "@/styles/shared";

export const Shell = styled.div`
  display: flex;
  min-height: 100dvh;
  width: 100%;
`;

export const Sidebar = styled.aside`
  display: none;
  flex-direction: column;
  width: 15rem;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--card);
  position: sticky;
  top: 0;
  height: 100dvh;

  ${breakpoint.lg} {
    display: flex;
  }
`;

export const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--foreground);

  svg {
    color: var(--primary);
  }
`;

export const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 0.75rem;
  flex: 1;
`;

export const SidebarFooter = styled.div`
  padding: 0.75rem;
  border-top: 1px solid var(--border);
`;

export const Main = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100dvh;
`;

export const TopBar = styled.header`
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  flex-shrink: 0;
`;

export const Content = styled.main`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 110rem;
  margin: 0 auto;
`;

/** Standard scrollable page body used by every non-gallery screen. */
export const PageScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.5rem 1rem;

  ${breakpoint.lg} {
    padding: 2rem;
  }
`;

export const PageInner = styled.div`
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

export const PageTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
`;

export const SearchWrap = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;

  ${breakpoint.md} {
    display: flex;
  }
`;

export const SearchBox = styled.div`
  position: relative;
  width: 100%;
  max-width: 32rem;

  svg {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1rem;
    height: 1rem;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  input {
    width: 100%;
    padding: 0.5rem 4.5rem 0.5rem 2.25rem;
    font-size: 0.875rem;
    border-radius: var(--radius);
    border: 1px solid var(--input);
    background: var(--background);
    color: var(--foreground);
    transition: border-color var(--duration-fast) ease;

    &::placeholder {
      color: var(--muted-foreground);
    }

    &:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 1px;
      border-color: transparent;
    }
  }

  kbd {
    position: absolute;
    right: 0.625rem;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-mono), monospace;
    font-size: 0.6875rem;
    color: var(--muted-foreground);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 4px);
    padding: 0.0625rem 0.3125rem;
    background: var(--muted);
    pointer-events: none;
  }
`;

export const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
`;

export const NavItem = styled(Link)<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ $active }) => ($active ? "var(--foreground)" : "var(--muted-foreground)")};
  background: ${({ $active }) => ($active ? "var(--accent)" : "transparent")};
  transition:
    background-color var(--duration-fast) ease,
    color var(--duration-fast) ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--accent);
      color: var(--foreground);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  &:active {
    transform: scale(0.98);
  }
`;
