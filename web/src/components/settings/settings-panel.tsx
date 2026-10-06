"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logout } from "@/data/api-client";
import { getBillingStatus } from "@/data/billing";
import { getUsage } from "@/data/cloud-photos-repository";
import {
  getUserPreferences,
  updateUserPreferences,
  type UploadQuality,
} from "@/data/user-preferences";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { formatBytes } from "@/lib/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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

const UPLOAD_QUALITY_OPTIONS: { value: UploadQuality; label: string }[] = [
  { value: "original", label: "Original quality" },
  { value: "storageSaver", label: "Storage saver" },
];

function qualityHint(prefs: { uploadQuality: UploadQuality; imageCapBytes: number; videoCapBytes: number } | undefined): string {
  if (!prefs) return "Choose how new uploads are stored on iPhotos Cloud.";
  return prefs.uploadQuality === "storageSaver"
    ? `Photos over ${formatBytes(prefs.imageCapBytes)} and videos over ${formatBytes(
        prefs.videoCapBytes
      )} are compressed server-side (videos to 1080p).`
    : `Photos up to ${formatBytes(prefs.imageCapBytes)} and videos up to ${formatBytes(
        prefs.videoCapBytes
      )} are stored exactly as uploaded.`;
}

export function SettingsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const signedOut = useAuthStore((s) => s.signedOut);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const statusQuery = useQuery({ queryKey: ["billing", "status"], queryFn: getBillingStatus });
  const usageQuery = useQuery({ queryKey: ["usage"], queryFn: getUsage });
  const prefsQuery = useQuery({ queryKey: ["preferences"], queryFn: getUserPreferences });

  // Set when a quality change leaves stored photos behind: the dialog offers a
  // one-click rewrite of every mismatch, or keeping them as they are.
  const [pendingQuality, setPendingQuality] = useState<UploadQuality | null>(null);

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

  const changeUploadQuality = (value: string) => {
    const quality = value as UploadQuality;
    if (quality === prefsQuery.data?.uploadQuality) return;
    // Save first with apply=false: the response reports how many stored photos
    // can still be rewritten, which drives the confirm dialog.
    void updateUserPreferences(quality, false)
      .then((saved) => {
        queryClient.setQueryData(["preferences"], saved);
        if (saved.mismatchedPhotoCount > 0) {
          setPendingQuality(quality);
        }
      })
      .catch(() => toast("Could not save the upload quality."));
  };

  const applyToExisting = () => {
    if (!pendingQuality) return;
    const quality = pendingQuality;
    setPendingQuality(null);
    void updateUserPreferences(quality, true)
      .then((saved) => {
        queryClient.setQueryData(["preferences"], saved);
        queryClient.invalidateQueries({ queryKey: ["usage"] });
        toast("Existing photos are being updated.");
      })
      .catch(() => toast("Could not update the existing photos."));
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
          <h2 className="text-base font-semibold leading-tight">Upload quality</h2>
          <Row>
            <div className="meta">
              <strong>Backup quality</strong>
              <span>{qualityHint(prefsQuery.data)}</span>
            </div>
            <Select
              value={prefsQuery.data?.uploadQuality ?? "storageSaver"}
              onValueChange={changeUploadQuality}
              disabled={prefsQuery.isPending}
            >
              <SelectTrigger className="w-40" aria-label="Upload quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPLOAD_QUALITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
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

        <AlertDialog
          open={pendingQuality !== null}
          onOpenChange={(open) => {
            if (!open) setPendingQuality(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update existing photos?</AlertDialogTitle>
              <AlertDialogDescription>
                {prefsQuery.data && prefsQuery.data.mismatchedPhotoCount > 0
                  ? `${prefsQuery.data.mismatchedPhotoCount} photo${
                      prefsQuery.data.mismatchedPhotoCount === 1 ? " is" : "s are"
                    } stored in a different quality and can be rewritten to match. This runs in the background and cannot be undone.`
                  : "Stored photos that don't match can be rewritten. This runs in the background and cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep existing</AlertDialogCancel>
              <AlertDialogAction onClick={applyToExisting}>
                Update {prefsQuery.data?.mismatchedPhotoCount ?? 0}{" "}
                {prefsQuery.data?.mismatchedPhotoCount === 1 ? "photo" : "photos"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageInner>
    </PageScroll>
  );
}
