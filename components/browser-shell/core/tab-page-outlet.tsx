"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useShellInfo, useTabsSnapshot } from "@/lib/browser-shell";
import { initialKeepAlive, keepAliveInputOf, keepAliveLimit, reconcileKeepAlive } from "@/lib/browser-shell/keep-alive";
import { useLiveTabNavigation } from "./tab-navigation";
import { TabSlot } from "./tab-slot";

/**
 * The page region every chrome renders exactly once inside its content element
 * (`#desktop-content` / `#mobile-content`). Every tab whose page has been shown keeps it mounted
 * in its own slot (lib/browser-shell/keep-alive.ts decides which): switching tabs hides the
 * previous page and reveals the next one instead of remounting it, and a soft reload remounts
 * only the reloaded tab's page. Slot elements carry `data-tab-slot` / `data-tab-active`
 * (activeTabRoot() in lib/browser-shell/scroll.ts finds the displayed one).
 */
export function TabPageOutlet({ children, className }: { children: ReactNode; className?: string }) {
  const snapshot = useTabsSnapshot();
  const live = useLiveTabNavigation();
  const limit = keepAliveLimit(useShellInfo()?.layout ?? "desktop");
  const input = useMemo(() => keepAliveInputOf(snapshot, live.urlKey, limit), [snapshot, live.urlKey, limit]);
  const [stored, setStored] = useState(() => initialKeepAlive(input));
  const keepAlive = reconcileKeepAlive(stored, input);
  if (keepAlive !== stored) setStored(keepAlive);

  return keepAlive.slots.map((slot) => (
    <TabSlot
      key={slot.key}
      tabId={slot.tabId}
      active={slot.key === keepAlive.liveSlot}
      reloads={slot.reloads}
      live={live}
      className={className}
    >
      {children}
    </TabSlot>
  ));
}
