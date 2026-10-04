import type { Metadata } from "next";
import { SubscriptionPanel } from "@/components/billing/subscription-panel";

export const metadata: Metadata = {
  title: "Subscription",
};

export default function SubscriptionPage() {
  return <SubscriptionPanel />;
}
