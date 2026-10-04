"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logout } from "@/data/api-client";
import { getBillingStatus } from "@/data/billing";
import { getUsage } from "@/data/cloud-photos-repository";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageInner, PageScroll, PageTitle } from "@/components/shell/app-shell.styles";
import { Row, UsageBox } from "./settings-panel.styles";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export function SettingsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const signedOut = useAuthStore((s) => s.signedOut);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const statusQuery = useQuery({ queryKey: ["billing", "status"], queryFn: getBillingStatus });
  const usageQuery = useQuery({ queryKey: ["usage"], queryFn: getUsage });

  const quota = statusQuery.data?.quotaBytes ?? usageQuery.data?.quotaBytes ?? 0;
  const used = usageQuery.data?.usedBytes ?? 0;
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  const signOut = () => {
    void logout().then(() => {
      queryClient.clear();
      signedOut();
      toast("Signed out");
      router.replace("/login");
    });
  };

  return (
    <PageScroll>
      <PageInner>
        <PageTitle>Settings</PageTitle>

        <Card className="gap-4 p-6">
          <h2 className="text-base font-semibold leading-tight">Account</h2>
          <Row>
            <div className="meta">
              <strong>{user?.displayName || user?.email || "Account"}</strong>
              <span>{user?.email ?? ""}</span>
            </div>
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </Row>

          <UsageBox>
            {statusQuery.isPending || usageQuery.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="labels">
                  <span>
                    Storage used · {usageQuery.data ? `${usageQuery.data.photoCount} photos` : ""}
                  </span>
                  <span>
                    {formatBytes(used)} of {formatBytes(quota)}
                  </span>
                </div>
                <Progress value={Math.round(percent)} aria-label="Storage used" />
                {statusQuery.data && statusQuery.data.plan !== "free" ? (
                  <span className="hint">
                    Plan: {statusQuery.data.plan}
                  </span>
                ) : (
                  <span className="hint">Free plan</span>
                )}
              </>
            )}
          </UsageBox>
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="text-base font-semibold leading-tight">Appearance</h2>
          <Row>
            <div className="meta">
              <strong>Theme</strong>
              <span>Dark is the default; pick what suits your room.</span>
            </div>
            <Select value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
              <SelectTrigger className="w-32" aria-label="Theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Card>
      </PageInner>
    </PageScroll>
  );
}
