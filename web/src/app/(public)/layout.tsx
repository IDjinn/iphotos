import { CenteredLayout } from "@/components/auth/auth-screen.styles";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CenteredLayout>{children}</CenteredLayout>;
}
