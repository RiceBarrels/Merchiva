import { createElement } from "react";
import { Plus } from "lucide-react";
import {
  AppStoreIcon,
  BookingsIcon,
  ChannelIcon,
  DashboardIcon,
  DirectoryIcon,
  DocsIcon,
  InventoryIcon,
  PayIcon,
  ProductsIcon,
  ReportsIcon,
  SalesIcon,
  ScheduleIcon,
  SettingsIcon,
  TasksIcon,
  TrainingIcon,
  type AppIcon,
} from "@/components/device/app-icons";
import type { RouteDef, TabUrl } from "./types";

/** lucide `Plus` wrapped as an AppIcon for the New Tab page (the app glyphs have no "plus"). */
export const NewTabIcon: AppIcon = function NewTabIcon({ className }) {
  return createElement(Plus, { className, "aria-hidden": true });
};

/**
 * Route registry. Listed sections mirror components/sidebar.tsx navItems plus Docs and
 * Settings; unlisted rows cover every other app/manager page.
 *
 * Every `permissionKey` equals the page's `<PermissionGuard section>` (verified with grep):
 *   inventory, inventory/waste, suppliers → inventory · sales, reports, finances → sales ·
 *   products, pricing → products · personnel/layout → staffing, personnel/team page → team ·
 *   channel → staffing · bookings, reviews, api-settings, settings/billing → settings.
 * Exceptions (no page guard): /manager/dashboard uses `dashboard` like the sidebar
 * (sidebar.tsx:86); docs use `dashboard` (plan D39); /manager/apps uses `settings` like the
 * sidebar (the page itself checks canManageDeviceApps); settings, usage (redirects to
 * settings), subscribe and new-tab have no guard — and neither does /manager, which is only
 * an alias for the New Tab home page.
 */
export const ROUTES: readonly RouteDef[] = [
  // ── Home ────────────────────────────────────────────────────────────────
  {
    // The Home section points at the New Tab page; "/manager" itself only redirects there.
    prefix: "/manager", exact: true, titleKey: "nav.home", icon: DashboardIcon,
    listed: true, section: true, sectionHref: "/manager/new-tab", previewKind: "blank",
    keywords: ["home", "start"],
  },
  {
    // Unlisted since Home became the New Tab page: still reachable by URL and omnibox search.
    prefix: "/manager/dashboard", titleKey: "browser.routes.dashboard", icon: DashboardIcon,
    permissionKey: "dashboard", listed: false, previewKind: "dashboard",
    keywords: ["dashboard", "overview", "briefing"],
  },
  // ── Docs ────────────────────────────────────────────────────────────────
  {
    prefix: "/manager/docs", exact: true, titleKey: "nav.docs", icon: DocsIcon, permissionKey: "dashboard",
    listed: true, section: true, previewKind: "grid",
    keywords: ["docs", "documents", "notes", "write", "files"],
  },
  {
    prefix: "/manager/docs/edit", titleKey: "nav.docs", icon: DocsIcon, permissionKey: "dashboard",
    listed: false, parent: "/manager/docs", mobileChrome: "docked", previewKind: "doc",
    volatileParams: ["new", "comment", "version"],
  },
  // ── Inventory ───────────────────────────────────────────────────────────
  {
    prefix: "/manager/inventory", titleKey: "nav.inventory", icon: InventoryIcon, permissionKey: "inventory",
    listed: true, section: true, previewKind: "list",
    keywords: ["inventory", "stock", "items", "count"],
  },
  {
    prefix: "/manager/suppliers", titleKey: "nav.suppliers", icon: InventoryIcon, permissionKey: "inventory",
    listed: true, parent: "/manager/inventory",
    keywords: ["suppliers", "vendors", "purchase orders", "orders"],
  },
  {
    prefix: "/manager/inventory/waste", titleKey: "nav.wasteLog", icon: InventoryIcon, permissionKey: "inventory",
    listed: true, parent: "/manager/inventory",
    keywords: ["waste", "spoilage", "loss"],
  },
  // ── Sales ───────────────────────────────────────────────────────────────
  {
    prefix: "/manager/sales", titleKey: "nav.sales", icon: SalesIcon, permissionKey: "sales",
    listed: true, section: true, previewKind: "dashboard",
    keywords: ["sales", "forecast", "prediction", "revenue"],
  },
  {
    prefix: "/manager/reports", titleKey: "nav.reports", icon: ReportsIcon, permissionKey: "sales",
    listed: true, parent: "/manager/sales",
    keywords: ["reports", "analytics", "charts"],
  },
  {
    prefix: "/manager/finances", titleKey: "nav.finances", icon: SalesIcon, permissionKey: "sales",
    listed: true, parent: "/manager/sales",
    keywords: ["finances", "money", "expenses", "profit"],
  },
  // ── Personnel ───────────────────────────────────────────────────────────
  {
    prefix: "/manager/personnel", titleKey: "nav.personnel", icon: DirectoryIcon, permissionKey: "staffing",
    listed: true, section: true, sectionHref: "/manager/personnel/schedule", mobileChrome: "docked",
    keywords: ["personnel", "staff", "employees", "people"],
  },
  {
    prefix: "/manager/personnel/schedule", titleKey: "personnel.tabs.schedule", icon: ScheduleIcon,
    permissionKey: "staffing", listed: true, parent: "/manager/personnel", mobileChrome: "docked",
    previewKind: "calendar", keywords: ["schedule", "shifts", "roster", "calendar", "timetable"],
  },
  {
    prefix: "/manager/personnel/team", titleKey: "personnel.tabs.team", icon: DirectoryIcon,
    permissionKey: "staffing", extraPermissionKey: "team", listed: true, parent: "/manager/personnel",
    mobileChrome: "docked", keywords: ["team", "members", "directory", "contacts"],
  },
  {
    prefix: "/manager/personnel/roles", titleKey: "personnel.tabs.roles", icon: TasksIcon,
    permissionKey: "staffing", listed: true, parent: "/manager/personnel", mobileChrome: "docked",
    keywords: ["tasks", "roles", "responsibilities", "checklists"],
  },
  {
    prefix: "/manager/personnel/training", titleKey: "personnel.tabs.training", icon: TrainingIcon,
    permissionKey: "staffing", listed: true, parent: "/manager/personnel", mobileChrome: "docked",
    keywords: ["training", "courses", "onboarding", "lessons"],
  },
  {
    prefix: "/manager/personnel/pay", titleKey: "personnel.tabs.pay", icon: PayIcon,
    permissionKey: "staffing", listed: true, parent: "/manager/personnel", mobileChrome: "docked",
    keywords: ["pay", "payroll", "wages", "hours"],
  },
  // ── Channel ─────────────────────────────────────────────────────────────
  {
    prefix: "/manager/channel", titleKey: "nav.chat", icon: ChannelIcon, permissionKey: "staffing",
    listed: true, section: true, mobileChrome: "docked", previewKind: "chat",
    keywords: ["channel", "chat", "messages", "merchiva"],
  },
  // ── Device apps ─────────────────────────────────────────────────────────
  {
    prefix: "/manager/apps", titleKey: "nav.apps", icon: AppStoreIcon, permissionKey: "settings",
    listed: true, section: true, previewKind: "grid",
    keywords: ["apps", "app store", "device apps", "install"],
  },
  // ── Settings ────────────────────────────────────────────────────────────
  {
    prefix: "/manager/settings", titleKey: "nav.settings", icon: SettingsIcon,
    listed: true, section: true, previewKind: "form",
    // One-shot OAuth callback params read by app/manager/settings/page.tsx:499-547.
    volatileParams: ["connected", "error", "pickLocation", "clover_connected", "clover_error", "schedule_connected", "schedule_error"],
    keywords: ["settings", "preferences", "store", "account", "language", "appearance"],
  },
  {
    prefix: "/manager/settings/billing", titleKey: "browser.routes.billing", icon: SettingsIcon,
    permissionKey: "settings", listed: false, parent: "/manager/settings", previewKind: "form",
    // Stripe return params, cleared by the page itself (settings/billing/page.tsx:107-116).
    volatileParams: ["session_id", "status"],
    keywords: ["billing", "subscription", "plan", "invoices", "payment"],
  },
  {
    prefix: "/manager/subscribe", titleKey: "browser.routes.subscribe", icon: SettingsIcon,
    kind: "gate", persist: false, listed: false, previewKind: "form",
    keywords: ["subscribe", "upgrade", "plan"],
  },
  // ── Unlisted pages ──────────────────────────────────────────────────────
  {
    prefix: "/manager/products", titleKey: "nav.products", icon: ProductsIcon, permissionKey: "products",
    listed: false, keywords: ["products", "catalog", "menu", "items"],
  },
  {
    prefix: "/manager/pricing", titleKey: "nav.pricing", icon: ProductsIcon, permissionKey: "products",
    listed: false, keywords: ["pricing", "prices", "margins"],
  },
  {
    prefix: "/manager/bookings", titleKey: "nav.bookings", icon: BookingsIcon, permissionKey: "settings",
    listed: false, previewKind: "calendar", keywords: ["bookings", "reservations", "appointments"],
  },
  {
    prefix: "/manager/reviews", titleKey: "nav.reviews", icon: BookingsIcon, permissionKey: "settings",
    listed: false, keywords: ["reviews", "feedback", "ratings"],
  },
  {
    prefix: "/manager/usage", titleKey: "nav.usage", icon: ReportsIcon,
    listed: false, keywords: ["ai usage", "usage"],
  },
  {
    prefix: "/manager/api-settings", titleKey: "nav.api", icon: SettingsIcon, permissionKey: "settings",
    listed: false, previewKind: "form", keywords: ["api", "integrations", "webhooks", "keys"],
  },
  {
    // The home page (HOME_URL). Its tab is labelled "Home" and carries the Home section's icon
    // (one destination, one glyph); only the "+" affordances say "New Tab" and draw NewTabIcon.
    prefix: "/manager/new-tab", exact: true, titleKey: "nav.home", icon: DashboardIcon,
    listed: false, parent: "/manager", previewKind: "blank", keywords: ["new tab", "start", "home"],
  },
];

const EXACT_ROUTES = ROUTES.filter((r) => r.exact);
const PREFIX_ROUTES = ROUTES.filter((r) => !r.exact);

function pathOnly(pathname: string): string {
  const p = (pathname.split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** Exact routes first, then the longest prefix match on segment boundaries. */
export function matchRoute(pathname: string): RouteDef | null {
  const p = pathOnly(pathname);
  for (const route of EXACT_ROUTES) {
    if (p === route.prefix) return route;
  }
  let best: RouteDef | null = null;
  for (const route of PREFIX_ROUTES) {
    if ((p === route.prefix || p.startsWith(`${route.prefix}/`)) && (!best || route.prefix.length > best.prefix.length)) {
      best = route;
    }
  }
  return best;
}

interface LegacyRedirect { readonly from: string; readonly to: string; readonly match: "exact" | "prefix" }

/**
 * next.config.ts redirects(), the two page-level redirects (app/manager/personnel/page.tsx,
 * app/manager/usage/page.tsx) and the "/manager" home alias.
 * "prefix" keeps the remainder of the path; the query string is always kept (as Next does).
 */
const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { from: "/~", to: "/manager", match: "prefix" },
  // "/manager" is an alias for the home page, so no tab, bookmark or persisted entry rests on it.
  { from: "/manager", to: "/manager/new-tab", match: "exact" },
  { from: "/manager/chat", to: "/manager/channel", match: "prefix" },
  { from: "/manager/staffing/todo", to: "/manager/personnel", match: "exact" },
  { from: "/manager/staffing", to: "/manager/personnel", match: "exact" },
  { from: "/manager/training", to: "/manager/personnel", match: "exact" },
  { from: "/manager/personnel", to: "/manager/personnel/schedule", match: "exact" },
  { from: "/manager/usage", to: "/manager/settings", match: "exact" },
];

/** Applies legacy redirects until stable (at most 5 hops). Returns the input unchanged when none apply. */
export function resolveLegacyRedirect(url: TabUrl): TabUrl {
  const q = url.indexOf("?");
  let pathname = pathOnly(q < 0 ? url : url.slice(0, q));
  const search = q < 0 ? "" : url.slice(q);
  let changed = false;
  for (let hop = 0; hop < 5; hop++) {
    const rule = LEGACY_REDIRECTS.find((r) =>
      r.match === "exact" ? pathname === r.from : pathname === r.from || pathname.startsWith(`${r.from}/`),
    );
    if (!rule) break;
    pathname = rule.match === "exact" ? rule.to : `${rule.to}${pathname.slice(rule.from.length)}`;
    changed = true;
  }
  return changed ? `${pathname}${search}` : url;
}

/** Last path segment, decoded and made readable ("waste-log" → "Waste log"); "" for none. */
export function prettifyPathSegment(pathname: string): string {
  const p = pathOnly(pathname);
  const raw = p.slice(p.lastIndexOf("/") + 1);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const words = decoded.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : "";
}

/**
 * Tab title (plan §B1.3): page title set with useSetTabTitle → registry title (the New Tab page
 * is the home page, so it resolves to `nav.home`) → last path segment → `browser.untitled`.
 */
export function titleForUrl(url: TabUrl, pageTitle: string | undefined, t: (key: string) => string): string {
  const fromPage = pageTitle?.replace(/\s+/g, " ").trim();
  if (fromPage) return fromPage;
  const q = url.indexOf("?");
  const pathname = pathOnly(q < 0 ? url : url.slice(0, q));
  const route = matchRoute(pathname);
  if (route) return t(route.titleKey);
  return prettifyPathSegment(pathname) || t("browser.untitled");
}
