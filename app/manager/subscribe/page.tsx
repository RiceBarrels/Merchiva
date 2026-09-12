"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SubscribePanel } from "@/components/billing/subscribe-panel";

/**
 * Full-screen paywall. Kept as a route for deep links and as the Stripe
 * return target from settings; the same panel is embedded on /choose so a
 * blocked store can be subscribed right where it is picked.
 */
export default function SubscribePage() {
  return (
    <Suspense fallback={<div className="p-6"><Spinner size={20} className="text-muted-foreground" /></div>}>
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-auto bg-background px-6 py-10">
        <SubscribePanel returnPath="/manager/subscribe" />
      </div>
    </Suspense>
  );
}
