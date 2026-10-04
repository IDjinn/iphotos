import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { ViewerOverlay } from "@/components/viewer/viewer-overlay";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
      <ViewerOverlay />
    </AuthGate>
  );
}
