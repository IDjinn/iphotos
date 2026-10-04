import styled from "styled-components";
import { SparklesIcon } from "lucide-react";
import { breakpoint } from "@/styles/shared";

export const CenteredLayout = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
  background:
    radial-gradient(48rem 24rem at 50% -8rem, color-mix(in oklab, var(--primary) 8%, transparent), transparent),
    var(--background);
`;

export const Card = styled.div`
  width: 100%;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);

  ${breakpoint.md} {
    padding: 2.5rem 2rem;
  }
`;

export const BrandRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;

  svg {
    width: 2rem;
    height: 2rem;
    color: var(--primary);
  }

  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.1;
  }

  p {
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }
`;

export const BrandIcon = styled(SparklesIcon)`
  width: 2rem;
  height: 2rem;
  color: var(--primary);
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  label {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
  }
`;

export const FieldError = styled.p`
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--destructive);
`;

export const FormError = styled.p`
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--destructive);
  text-align: center;
`;

export const SwitchLine = styled.p`
  font-size: 0.875rem;
  color: var(--muted-foreground);
  text-align: center;

  a {
    color: var(--foreground);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;

    &:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
      border-radius: 2px;
    }
  }
`;
