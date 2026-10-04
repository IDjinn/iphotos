"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getBillingCatalog,
  getBillingStatus,
  restorePurchase,
  rememberPurchaseToken,
  lastPurchaseToken,
  sandboxPurchaseToken,
  verifyPurchase,
  type BillingProduct,
} from "@/data/billing";
import { getUsage } from "@/data/cloud-photos-repository";
import { ApiError } from "@/data/api-client";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  PageInner,
  PageScroll,
  PageTitle,
} from "@/components/shell/app-shell.styles";
import { PlanRow, UsageBox } from "./subscription-panel.styles";

const STATE_LABEL: Record<string, string> = {
  Free: "Free",
  Active: "Active",
  Grace: "In grace period",
  Expired: "Expired",
};

export function SubscriptionPanel() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["billing", "status"], queryFn: getBillingStatus });
  const catalogQuery = useQuery({ queryKey: ["billing", "catalog"], queryFn: getBillingCatalog });
  const usageQuery = useQuery({ queryKey: ["usage"], queryFn: getUsage });
  const [verifying, setVerifying] = useState<string | null>(null);

  const revalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["billing", "status"] });
    await queryClient.invalidateQueries({ queryKey: ["usage"] });
  };

  const subscribe = useMutation({
    mutationFn: async (product: BillingProduct) => {
      const token = sandboxPurchaseToken();
      const status = await verifyPurchase(product.productId, token);
      rememberPurchaseToken(token);
      return status;
    },
    onSuccess: async (_status, product) => {
      toast(`Subscription active — ${product.displayName}`);
      await revalidate();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.message
          ? error.message
          : "The purchase couldn't be confirmed. Try again.",
      );
    },
    onSettled: () => setVerifying(null),
  });

  const restore = useMutation({
    mutationFn: async () => {
      const token = lastPurchaseToken();
      if (!token) return null;
      return restorePurchase(token);
    },
    onSuccess: async (status) => {
      if (!status) {
        toast("No purchase to restore on this device.");
        return;
      }
      toast("Purchase restored");
      await revalidate();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.message
          ? error.message
          : "The purchase couldn't be restored. Try again.",
      );
    },
  });

  const status = statusQuery.data;
  const catalog = catalogQuery.data;
  const usage = usageQuery.data;
  const quota = status?.quotaBytes ?? usage?.quotaBytes ?? 0;
  const used = usage?.usedBytes ?? 0;
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const planLabel =
    status && catalog
      ? (catalog.products.find((p) => p.productId === status.plan)?.displayName ??
        (status.plan === "free" ? "Free plan" : status.plan))
      : undefined;

  if (statusQuery.isError || catalogQuery.isError) {
    return (
      <PageScroll>
        <PageInner>
          <PageTitle>Subscription</PageTitle>
          <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your subscription. Check your connection and try again.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                void statusQuery.refetch();
                void catalogQuery.refetch();
              }}
            >
              Try again
            </Button>
          </Card>
        </PageInner>
      </PageScroll>
    );
  }

  return (
    <PageScroll>
      <PageInner>
        <PageTitle>Subscription</PageTitle>

        <Card className="gap-4 p-6">
          {statusQuery.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : status ? (
            <>
              <PlanRow>
                <div className="meta">
                  <strong>{planLabel ?? "Free plan"}</strong>
                  <span>
                    {STATE_LABEL[status.state] ?? status.state}
                    {status.expiresAt ? ` · renews ${formatDate(status.expiresAt)}` : ""}
                  </span>
                </div>
                <Badge variant={status.state === "Active" ? "secondary" : "outline"}>
                  {quota > 0 ? formatBytes(quota) : "—"}
                </Badge>
              </PlanRow>
              <UsageBox>
                <div className="labels">
                  <span>Storage used</span>
                  <span>
                    {formatBytes(used)} of {formatBytes(quota)}
                  </span>
                </div>
                <Progress value={Math.round(percent)} aria-label="Storage used" />
                <span className="hint">
                  {usage ? `${usage.photoCount} ${usage.photoCount === 1 ? "photo" : "photos"}` : ""}
                </span>
              </UsageBox>
            </>
          ) : null}
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="text-base font-semibold leading-tight">Plans</h2>
          {catalogQuery.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : catalog && catalog.products.length > 0 ? (
            <div className="flex flex-col gap-3">
              {catalog.products.map((product) => (
                <PlanRow key={product.productId}>
                  <div className="meta">
                    <strong>{product.displayName}</strong>
                    <span>{formatBytes(product.quotaBytes)} of storage</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{product.displayPrice}</span>
                    <Button
                      size="sm"
                      disabled={subscribe.isPending || status?.plan === product.productId}
                      onClick={() => {
                        setVerifying(product.productId);
                        subscribe.mutate(product);
                      }}
                    >
                      {status?.plan === product.productId
                        ? "Current plan"
                        : catalog.sandbox
                          ? "Start (sandbox)"
                          : "Subscribe"}
                    </Button>
                  </div>
                </PlanRow>
              ))}
              {catalog.sandbox ? (
                <p className="text-xs text-muted-foreground">
                  Sandbox environment — purchases are simulated, nothing is charged.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No plans available right now.</p>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Already purchased?</p>
            <Button
              variant="outline"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              Restore purchase
            </Button>
          </div>
          {verifying ? <span className="sr-only" aria-live="polite">Confirming purchase…</span> : null}
        </Card>
      </PageInner>
    </PageScroll>
  );
}
