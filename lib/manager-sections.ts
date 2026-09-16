// The single definition of every manager section and the sub-pages inside it.
//
// Two surfaces render from this list: the sidebar's expanded sub-nav
// (components/sidebar.tsx) and the page's own section nav
// (components/section-nav.tsx). Because both read the same entries, an icon,
// a label or an ordering can never drift between the sidebar and the page —
// which is exactly how they drifted before this file existed.
//
// Icons come from the same multi-colour set as the /store and /personal home
// grids (components/device/app-icons.tsx), so one feature has one glyph
// everywhere in Merchiva.

import {
  InventoryIcon,
  SuppliersIcon,
  WasteIcon,
  type AppIcon,
} from "@/components/device/app-icons";
import type { Permissions } from "@/lib/types";

export interface SectionTab {
  /** Stable id, unique inside its section. */
  id: string;
  /** Manager route this tab opens. */
  href: string;
  icon: AppIcon;
  /** i18n key for the tab name (reuses the existing `nav.*` keys). */
  labelKey: string;
  /** i18n key for the one-line description under the name. */
  subKey: string;
  /** Permission section gating the tab (undefined = everyone who can see the section). */
  permissionKey?: keyof Permissions;
}

export interface ManagerSection {
  /** Stable id, also the `<SectionNav section="...">` value. */
  id: string;
  tabs: SectionTab[];
}

export const MANAGER_SECTIONS: ManagerSection[] = [
  {
    id: "inventory",
    tabs: [
      {
        id: "inventory",
        href: "/manager/inventory",
        icon: InventoryIcon,
        labelKey: "nav.inventory",
        subKey: "sections.inventory.inventorySub",
        permissionKey: "inventory",
      },
      {
        id: "suppliers",
        href: "/manager/suppliers",
        icon: SuppliersIcon,
        labelKey: "nav.suppliers",
        subKey: "sections.inventory.suppliersSub",
        permissionKey: "inventory",
      },
      {
        id: "waste",
        href: "/manager/inventory/waste",
        icon: WasteIcon,
        labelKey: "nav.wasteLog",
        subKey: "sections.inventory.wasteSub",
        permissionKey: "inventory",
      },
    ],
  },
];

const BY_ID = new Map(MANAGER_SECTIONS.map((s) => [s.id, s]));

export function sectionById(id: string): ManagerSection | null {
  return BY_ID.get(id) ?? null;
}

/** The section owning a route, or null when the route isn't in one. Longest prefix wins. */
export function sectionForHref(pathname: string | null | undefined): ManagerSection | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let best: ManagerSection | null = null;
  let bestLen = -1;
  for (const section of MANAGER_SECTIONS) {
    for (const tab of section.tabs) {
      if ((path === tab.href || path.startsWith(tab.href + "/")) && tab.href.length > bestLen) {
        best = section;
        bestLen = tab.href.length;
      }
    }
  }
  return best;
}

/** Whether a tab is the active one for the current pathname. */
export function isTabActive(tab: SectionTab, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === tab.href) return true;
  if (!path.startsWith(tab.href + "/")) return false;
  // A deeper tab in the same section owns the path instead (e.g. /manager/inventory
  // must not stay active on /manager/inventory/waste).
  const section = MANAGER_SECTIONS.find((s) => s.tabs.includes(tab));
  return !section?.tabs.some((o) => o !== tab && (path === o.href || path.startsWith(o.href + "/")));
}
