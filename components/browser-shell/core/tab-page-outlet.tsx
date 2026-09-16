"use client";

import type { ReactNode } from "react";
import { PageTransition } from "@/components/page-transition";
import { useTabMountKey } from "@/lib/browser-shell";
import { cn } from "@/lib/utils";

/**
 * The page region every chrome renders exactly once inside its content element
 * (`#desktop-content` / `#mobile-content`). Keyed by the tab mount key so a soft
 * reload or a same-URL tab activation remounts the page; different-URL activations
 * already remount through PageTransition's pathname key.
 */
export function TabPageOutlet({ children, className }: { children: ReactNode; className?: string }) {
  const mountKey = useTabMountKey();
  return (
    <main data-tab-scroll-root="" className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden", className)}>
      <PageTransition key={mountKey}>{children}</PageTransition>
    </main>
  );
}
