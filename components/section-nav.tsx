"use client";

// The section navigation shown at the top of every manager page that has
// sub-pages. Replaces the old text-only PageTabs: each tab carries the same
// multi-colour icon the sidebar and the device grids use, plus a one-line
// description, so a section reads the same everywhere in Merchiva. On phones
// the tabs move to a bottom tab bar (SectionBottomNav).
//
// Tabs come from lib/manager-sections.ts — the sidebar's expanded sub-nav
// renders from that same list, so the two can't drift apart.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { skipNextPageTransition } from "@/components/page-tabs";
import { isTabActive, sectionById, type SectionTab } from "@/lib/manager-sections";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { BottomTabBar } from "@/components/bottom-tab-bar";

function useSectionTabs(section: string) {
  const { installed } = useDeviceApps();
  const { can } = usePermissions();
  return (sectionById(section)?.tabs ?? []).filter(
    (tab) =>
      isManagerRouteEnabled(tab.href, installed) &&
      (!tab.permissionKey || can(tab.permissionKey, "view")),
  );
}

function onNavigate() {
  hapticLight();
  skipNextPageTransition();
}

/** The section's tab row at the top of the page — `md` and up; phones get {@link SectionBottomNav}. */
export function SectionNav({ section }: { section: string }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = useSectionTabs(section);

  if (tabs.length < 2) return null;

  return (
    <div className="hidden md:block border-b border-border bg-background shrink-0">
      {/* Segmented cards with icon + description. */}
      <div className="flex overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <DesktopTab
            key={tab.href}
            tab={tab}
            active={isTabActive(tab, pathname)}
            label={t(tab.labelKey)}
            sub={t(tab.subKey)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The same tabs as a bottom tab bar below `md`. Rendered by the section's route
 * layouts after the page, so it sits at the end of the scroll root.
 */
export function SectionBottomNav({ section }: { section: string }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = useSectionTabs(section);
  return (
    <BottomTabBar
      // A section is named after its first tab (Inventory → Inventory, Suppliers, Waste).
      label={t(sectionById(section)?.tabs[0]?.labelKey ?? "")}
      onNavigate={onNavigate}
      tabs={tabs.map((tab) => ({
        href: tab.href,
        label: t(tab.labelKey),
        icon: tab.icon,
        active: isTabActive(tab, pathname),
      }))}
    />
  );
}

function DesktopTab({ tab, active, label, sub, onNavigate }: {
  tab: SectionTab;
  active: boolean;
  label: string;
  sub: string;
  onNavigate: () => void;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      onClick={onNavigate}
      className={cn(
        "flex-1 shrink-0 flex items-center gap-2 lg:gap-2.5 px-3 lg:px-4 py-2 lg:py-2.5 transition-colors border-r border-border last:border-r-0 relative whitespace-nowrap",
        active ? "bg-muted" : "bg-background hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "w-7 h-7 lg:w-8 lg:h-8 rounded-lg inline-flex items-center justify-center shrink-0 transition-colors",
          active ? "bg-background shadow-[inset_0_0_0_.5px_rgb(0_0_0/.08)]" : "bg-muted",
        )}
      >
        <Icon className="h-[17px] w-[17px] lg:h-[18px] lg:w-[18px]" />
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
      {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />}
    </Link>
  );
}
