"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  GraduationCap,
  Inbox,
  Shield,
  Users,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { usePersonnelHub } from "@/components/personnel/hub-context";

interface HubTab {
  /** Route segment under /~/personnel. */
  segment: "schedule" | "team" | "roles" | "training";
  i18nKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TABS: HubTab[] = [
  { segment: "schedule", i18nKey: "schedule", icon: CalendarClock },
  { segment: "team", i18nKey: "team", icon: Users },
  { segment: "roles", i18nKey: "roles", icon: Shield },
  { segment: "training", i18nKey: "training", icon: GraduationCap },
];

function hrefFor(segment: HubTab["segment"]) {
  return `/~/personnel/${segment}`;
}

// ─── Loading fallback ────────────────────────────────────────────────────────

export function PersonnelLoading() {
  return (
    <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
      Loading…
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function PersonnelHeader() {
  const t = useT();
  const { pending, openRequests } = usePersonnelHub();

  return (
    <div className="px-4 lg:px-6 py-3 border-b border-border bg-background flex items-center gap-3 shrink-0 -mx-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
          {t("personnel.title")}
        </h1>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {t("personnel.subtitle")}
        </div>
      </div>
      {/* Mobile-only inbox button — opens the requests bottom sheet */}
      <button
        type="button"
        onClick={openRequests}
        className="md:hidden relative h-9 w-9 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"
        aria-label="Pending requests"
      >
        <Inbox className="h-4 w-4" strokeWidth={1.75} />
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-mono font-bold inline-flex items-center justify-center border-[1.5px] border-background">
            {pending}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

export function PersonnelTabsNav() {
  const t = useT();
  const pathname = usePathname();
  const { pending } = usePersonnelHub();

  const isActive = (segment: HubTab["segment"]) => {
    const href = hrefFor(segment);
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Mobile — horizontally scrollable pill tabs */}
      <div className="md:hidden border-b border-border bg-background shrink-0">
        <div className="flex gap-1.5 px-3.5 py-2.5 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const active = isActive(tab.segment);
            const Icon = tab.icon;
            const label = t(`personnel.tabs.${tab.i18nKey}`);
            return (
              <Link
                key={tab.segment}
                href={hrefFor(tab.segment)}
                onClick={() => hapticLight()}
                className={cn(
                  "h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-[13px] transition-colors shrink-0 whitespace-nowrap",
                  active
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "bg-background text-stone-700 dark:text-stone-200 border-border font-medium hover:bg-muted",
                )}
              >
                <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
                {label}
                {tab.segment === "schedule" && pending > 0 && (
                  <span
                    className={cn(
                      "ml-1 min-w-[16px] h-[16px] px-1 rounded-full font-mono font-bold text-[9.5px] tabular-nums inline-flex items-center justify-center",
                      active
                        ? "bg-background/20 text-background"
                        : "bg-amber-500 text-white",
                    )}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Desktop — card-style segmented tabs */}
      <div className="hidden md:flex border-b border-border bg-background items-stretch shrink-0">
        <div className="flex-1 flex overflow-x-auto">
          {TABS.map((tab) => {
            const active = isActive(tab.segment);
            const Icon = tab.icon;
            const label = t(`personnel.tabs.${tab.i18nKey}`);
            const sub = t(`personnel.tabs.${tab.i18nKey}Sub`);
            return (
              <Link
                key={tab.segment}
                href={hrefFor(tab.segment)}
                onClick={() => hapticLight()}
                className={cn(
                  "flex-1 min-w-[170px] flex items-center gap-2.5 px-3 md:px-5 py-2.5 transition-colors border-r border-border last:border-r-0 relative",
                  active ? "bg-muted/50" : "bg-background hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "w-8 h-8 rounded-[0.3rem] inline-flex items-center justify-center shrink-0",
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} />
                </span>
                <div className="text-left min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-[13.5px] font-semibold tracking-[-0.01em]",
                        active
                          ? "text-foreground"
                          : "text-stone-700 dark:text-stone-200",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px] truncate hidden md:block",
                      active ? "text-muted-foreground" : "text-muted-foreground/80",
                    )}
                  >
                    {sub}
                  </div>
                </div>
                {tab.segment === "schedule" && pending > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold inline-flex items-center justify-center">
                    {pending}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
