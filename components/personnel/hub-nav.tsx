"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  GraduationCap,
  Users,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { usePersonnelHub } from "@/components/personnel/hub-context";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { usePermissions } from "@/lib/context/permissions";
import { useNavMode } from "@/lib/nav-mode";
import { useShellInfo } from "@/lib/browser-shell/shell-context";

interface HubTab {
  /** Route segment under /manager/personnel. */
  segment: "schedule" | "team" | "roles" | "training" | "pay";
  i18nKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TABS: HubTab[] = [
  { segment: "schedule", i18nKey: "schedule", icon: CalendarClock },
  { segment: "team", i18nKey: "team", icon: Users },
  // "Roles" is the Tasks app in the manager UI: roles + their task lists.
  { segment: "roles", i18nKey: "roles", icon: ClipboardList },
  { segment: "training", i18nKey: "training", icon: GraduationCap },
  { segment: "pay", i18nKey: "pay", icon: CircleDollarSign },
];

function hrefFor(segment: HubTab["segment"]) {
  return `/manager/personnel/${segment}`;
}

// ─── Loading fallback ────────────────────────────────────────────────────────

export function PersonnelLoading() {
  const t = useT();
  return (
    <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
      {t("common.loading")}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function PersonnelHeader() {
  const t = useT();
  // In sidebar nav mode phones/tablets get a floating hamburger pinned over the
  // top-left corner (lg:hidden), and the phone shell a menu button in the top
  // start corner — leave room for them like PageHeader does.
  const shell = useShellInfo();
  const [navMode] = useNavMode();
  return (
    <div className="h-14 px-4 lg:px-6 border-b border-border bg-background flex items-center gap-3 shrink-0">
      <div className={cn("min-w-0 flex-1", !shell && navMode === "sidebar" && "pl-14 lg:pl-0", shell?.layout === "mobile" && "ps-14")}>
        <h1 className="text-[15px] font-semibold leading-tight truncate">
          {t("personnel.title")}
        </h1>
        <div className="text-[11.5px] text-muted-foreground leading-tight truncate">
          {t("personnel.subtitle")}
        </div>
      </div>
    </div>
  );
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

export function PersonnelTabsNav() {
  const t = useT();
  const pathname = usePathname();
  const { pending } = usePersonnelHub();
  const { installed } = useDeviceApps();
  const { can } = usePermissions();
  // Tasks (roles) / training / pay are optional org apps (see /manager/apps).
  // The Team tab additionally needs team.view (the page itself is guarded).
  const tabs = TABS.filter(
    (tab) =>
      isManagerRouteEnabled(hrefFor(tab.segment), installed) &&
      (tab.segment !== "team" || can("team", "view")),
  );

  const isActive = (segment: HubTab["segment"]) => {
    const href = hrefFor(segment);
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="border-b border-border bg-background shrink-0">
      {/* Mobile: compact underline tabs (same style as PageTabs) */}
      <div className="flex md:hidden overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = isActive(tab.segment);
          return (
            <Link
              key={tab.segment}
              href={hrefFor(tab.segment)}
              onClick={() => hapticLight()}
              className={cn(
                "flex-1 shrink-0 flex items-center justify-center gap-1 px-3.5 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`personnel.tabs.${tab.i18nKey}`)}
              {tab.segment === "schedule" && pending > 0 && (
                <span className="min-w-[15px] h-[15px] px-1 rounded-full bg-foreground text-background text-[9px] font-mono font-bold tabular-nums inline-flex items-center justify-center">
                  {pending}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {/* Desktop: segmented tab row with icons + subtitles */}
      <div className="hidden md:flex overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
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
                "flex-1 shrink-0 flex items-center gap-2 lg:gap-2.5 px-3 lg:px-4 py-2 lg:py-2.5 transition-colors border-r border-border last:border-r-0 relative whitespace-nowrap",
                active ? "bg-muted" : "bg-background hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "w-7 h-7 lg:w-8 lg:h-8 rounded-lg inline-flex items-center justify-center shrink-0",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} />
              </span>
              <div className="text-left min-w-0">
                <div
                  className={cn(
                    "text-[13px] lg:text-[13.5px] font-semibold tracking-[-0.01em] truncate",
                    active ? "text-foreground" : "text-foreground/80",
                  )}
                >
                  {label}
                </div>
                <div
                  className={cn(
                    "text-[11px] truncate hidden lg:block",
                    active ? "text-muted-foreground" : "text-muted-foreground/80",
                  )}
                >
                  {sub}
                </div>
              </div>
              {tab.segment === "schedule" && pending > 0 && (
                <span className="ml-auto min-w-[17px] h-[17px] px-1 rounded-full bg-foreground text-background text-[10px] font-mono font-bold tabular-nums inline-flex items-center justify-center">
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
  );
}
