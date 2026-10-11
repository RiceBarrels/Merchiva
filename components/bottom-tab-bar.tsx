"use client";

// The phone's bottom tab bar for a manager page with sub-pages (Personnel,
// the Inventory section). Below `md` it replaces the top tab row: one cell per
// sub-page, icon on top and name underneath. It portals into PageTransition's
// bottom-bar slot, under the animated page, so page transitions never move or
// remount it; outside a PageTransition it renders in flow and sticks to the
// bottom of the scroll root. Either way it never covers the page's last row (the
// phone shell already reserves the safe-area inset under the page; the bar adds
// 8px of its own below the tabs).

import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePageBottomBarSlot } from "@/components/page-transition";

export interface BottomTab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  /** Count shown on the icon's corner; hidden at 0. */
  badge?: number;
}

export function BottomTabBar({ tabs, label, onNavigate }: {
  tabs: BottomTab[];
  /** Accessible name of the bar. */
  label: string;
  onNavigate: () => void;
}) {
  const slot = usePageBottomBarSlot();
  // Inside a PageTransition whose slot has not mounted yet: wait one commit instead of
  // rendering in place and moving.
  if (tabs.length < 2 || slot === null) return null;
  const bar = (
    <nav
      aria-label={label}
      className="md:hidden sticky bottom-0 z-30 mt-auto shrink-0 border-t border-border bg-background pb-2"
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={onNavigate}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 min-h-[54px] py-1.5 transition-colors active:bg-muted",
                tab.active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {tab.active && <span className="absolute top-0 h-[2px] w-7 bg-foreground" />}
              <span
                className={cn(
                  "relative flex h-7 w-12 items-center justify-center rounded-[0.4rem] transition-colors",
                  tab.active && "bg-muted",
                )}
              >
                <Icon className="h-[20px] w-[20px]" />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 end-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-foreground text-background text-[9px] font-mono font-bold tabular-nums inline-flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[10.5px] leading-none tracking-tight",
                  tab.active ? "font-semibold" : "font-medium",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
  return slot ? createPortal(bar, slot) : bar;
}
