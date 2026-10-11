"use client";

import { useEffect } from "react";
import { useDocumentAttended, useMarkDotRead, useNotificationDots } from "@/lib/notifications/dots-context";

/**
 * Mr. Merchiva's notification rows ("Mr. Merchiva replied", lib/notifications/features.ts) are
 * read while his dock is open and someone is at the page (lib/notifications/attention.ts), so the
 * rail's dot (dock-panel.tsx) only ever stands for replies that came in while it was closed or
 * nobody was there. It re-runs when a new one arrives with the dock open. The phone layout has
 * no rail and his rows light nothing there, but opening him reads them all the same. A shared
 * store screen marks nothing (the provider's markRead).
 */
export function useMerchivaDotClearing(open: boolean): void {
  const { state } = useNotificationDots();
  const attended = useDocumentAttended();
  const markDotRead = useMarkDotRead();
  const waiting = state.entries
    .filter((entry) => entry.app === "merchiva")
    .map((entry) => entry.id)
    .join(",");
  useEffect(() => {
    if (open && attended && waiting) markDotRead({ app: "merchiva" });
  }, [open, attended, waiting, markDotRead]);
}
