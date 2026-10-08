// Navigation model — mirrors components/sidebar.tsx 1:1 (same order, same
// section labels, same sub-page "tabs"). `page` maps a section to the Ink page
// component key; `tabs` mirror each section's PageTabs.

export interface NavTab {
  label: string;
  /** Page key the tab routes to. */
  page: string;
}

/** Permission section keys (mirror lib/types Permissions). */
export type PermKey =
  | "dashboard"
  | "inventory"
  | "sales"
  | "staffing"
  | "products"
  | "settings"
  | "team"
  | "training_grading"
  | "drive";

export interface NavSection {
  /** Page key (used for routing + the pages registry). */
  page: string;
  label: string;
  /** Single-key hint shown in the sidebar (like a keyboard accelerator). */
  icon: string;
  /** Permission section gating this nav entry (mirrors sidebar permissionKey). */
  perm?: PermKey;
  tabs?: NavTab[];
}

// Order and labels match the web sidebar's `navItems`.
export const NAV: NavSection[] = [
  { page: "dashboard", label: "Dashboard", icon: "◧", perm: "dashboard" },
  {
    page: "inventory",
    label: "Inventory",
    icon: "▤",
    perm: "inventory",
    tabs: [
      { label: "Inventory", page: "inventory" },
      { label: "Suppliers", page: "suppliers" },
      { label: "Waste Log", page: "waste" },
    ],
  },
  {
    page: "products",
    label: "Products",
    icon: "◰",
    perm: "products",
    tabs: [
      { label: "Products", page: "products" },
      { label: "Pricing", page: "pricing" },
    ],
  },
  {
    page: "sales",
    label: "Sales",
    icon: "◔",
    perm: "sales",
    tabs: [
      { label: "Sales", page: "sales" },
      { label: "Reports", page: "reports" },
      { label: "Finances", page: "finances" },
    ],
  },
  {
    page: "personnel",
    label: "Personnel",
    icon: "◍",
    perm: "staffing",
    tabs: [
      { label: "Schedule", page: "schedule" },
      { label: "Team", page: "personnel" },
      { label: "Roles", page: "roles" },
      { label: "Training", page: "training" },
    ],
  },
  { page: "chat", label: "Chat", icon: "✦", perm: "staffing" },
  { page: "settings", label: "Settings", icon: "⚙" },
];

/** All page keys reachable via a section row or one of its tabs. */
export function allPageKeys(): string[] {
  const keys = new Set<string>();
  for (const s of NAV) {
    keys.add(s.page);
    for (const t of s.tabs ?? []) keys.add(t.page);
  }
  return [...keys];
}

/** Find the section that owns a page key (so the header can show its tabs). */
export function sectionForPage(page: string): NavSection | undefined {
  return NAV.find((s) => s.page === page || s.tabs?.some((t) => t.page === page));
}
