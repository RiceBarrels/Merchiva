import { describe, expect, test } from "bun:test";
import type { AppMode } from "@/lib/app-mode";
import { getRouteAccess, listNavSections, searchRoutes } from "@/lib/browser-shell/access";
import type { AccessContext } from "@/lib/browser-shell/types";
import type { Permissions } from "@/lib/types";

type Section = keyof Permissions;

const ALL_APPS = ["sales", "products", "tasks", "training", "pay", "bookings", "docs"];

function ctx(opts: {
  owner?: boolean;
  view?: readonly Section[];
  apps?: readonly string[];
  appsReady?: boolean;
  mode?: AppMode | null;
  capacitor?: boolean;
} = {}): AccessContext {
  const view = new Set<Section>(opts.view ?? []);
  const mode = opts.mode === undefined ? "admin" : opts.mode;
  return {
    isOwner: opts.owner === true,
    can: (section) => opts.owner === true || view.has(section),
    installedApps: new Set(opts.apps ?? ALL_APPS),
    appsReady: opts.appsReady ?? true,
    appMode: mode,
    personalMode: mode === "personal",
    isCapacitor: opts.capacitor === true,
  };
}

const EN: Record<string, string> = {
  "nav.home": "Home",
  "nav.docs": "Docs",
  "nav.inventory": "Inventory",
  "nav.wasteLog": "Waste Log",
  "nav.suppliers": "Suppliers",
  "nav.sales": "Sales",
  "nav.reports": "Reports",
  "nav.finances": "Finances",
  "nav.personnel": "Personnel",
  "personnel.tabs.schedule": "Schedule",
  "personnel.tabs.team": "Team",
  "personnel.tabs.roles": "Tasks",
  "personnel.tabs.training": "Training",
  "personnel.tabs.pay": "Pay",
  "nav.chat": "Channel",
  "nav.apps": "Apps",
  "nav.settings": "Settings",
  "nav.products": "Products",
  "nav.pricing": "Pricing",
  "nav.bookings": "Bookings",
  "nav.reviews": "Reviews",
  "nav.api": "API",
  "browser.routes.billing": "Billing",
  "browser.routes.dashboard": "Dashboard",
  "browser.routes.subscribe": "Subscription",
  "browser.newTab": "New Tab",
};
const t = (key: string) => EN[key] ?? key;

describe("getRouteAccess", () => {
  test("order: notTabbable → unknownRoute → forbidden → featureOff → allowed", () => {
    const staff = ctx({ view: ["inventory"], apps: [] });
    expect(getRouteAccess("/choose", staff)).toBe("notTabbable");
    expect(getRouteAccess("/manager/setup/store", staff)).toBe("notTabbable");
    expect(getRouteAccess("/manager/nowhere", staff)).toBe("unknownRoute");
    expect(getRouteAccess("/manager/sales", staff)).toBe("forbidden");
    expect(getRouteAccess("/manager/inventory/waste?day=1", staff)).toBe("allowed");
    const owner = ctx({ owner: true, apps: [] });
    expect(getRouteAccess("/manager/sales", owner)).toBe("featureOff");
    expect(getRouteAccess("/manager/personnel/pay/", owner)).toBe("featureOff");
    expect(getRouteAccess("/manager/sales", ctx({ owner: true, apps: [], appsReady: false }))).toBe("allowed");
    expect(getRouteAccess("/manager/sales", ctx({ owner: true }))).toBe("allowed");
  });

  test("routes without a permission key are open to every member", () => {
    const nobody = ctx();
    for (const url of ["/manager", "/manager/settings", "/manager/new-tab", "/manager/subscribe", "/manager/usage"]) {
      expect(getRouteAccess(url, nobody)).toBe("allowed");
    }
    expect(getRouteAccess("/manager/settings/billing", nobody)).toBe("forbidden");
    expect(getRouteAccess("/manager/dashboard", nobody)).toBe("forbidden");
  });

  test("personnel team needs staffing and team; docs follow dashboard.view and the Docs app", () => {
    expect(getRouteAccess("/manager/personnel/team", ctx({ view: ["staffing"] }))).toBe("forbidden");
    expect(getRouteAccess("/manager/personnel/team", ctx({ view: ["team"] }))).toBe("forbidden");
    expect(getRouteAccess("/manager/personnel/team", ctx({ view: ["staffing", "team"] }))).toBe("allowed");
    expect(getRouteAccess("/manager/personnel/schedule", ctx({ view: ["staffing"] }))).toBe("allowed");
    expect(getRouteAccess("/manager/docs", ctx({ view: ["dashboard"] }))).toBe("allowed");
    expect(getRouteAccess("/manager/docs/edit?id=1", ctx({ view: ["dashboard"] }))).toBe("allowed");
    expect(getRouteAccess("/manager/docs", ctx({ view: ["inventory"] }))).toBe("forbidden");
    // Docs is an installable app (lib/device-apps.ts): without it the feature is off for everyone.
    expect(getRouteAccess("/manager/docs", ctx({ owner: true, apps: [] }))).toBe("featureOff");
    expect(getRouteAccess("/manager/docs/edit?id=1", ctx({ owner: true, apps: [] }))).toBe("featureOff");
  });

  test("the native app and personal mode don't change route access", () => {
    const view: Section[] = ["inventory", "staffing"];
    expect(getRouteAccess("/manager/inventory", ctx({ view, capacitor: true }))).toBe("allowed");
    expect(getRouteAccess("/manager/inventory", ctx({ view, mode: "personal" }))).toBe("allowed");
  });
});

describe("listNavSections", () => {
  test("owner with every app sees every section in sidebar order", () => {
    const sections = listNavSections(ctx({ owner: true }));
    expect(sections.map((s) => s.href)).toEqual([
      "/manager/new-tab",
      "/manager/docs",
      "/manager/inventory",
      "/manager/sales",
      "/manager/personnel/schedule",
      "/manager/channel",
      "/manager/apps",
      "/manager/settings",
    ]);
    const byHref = new Map(sections.map((s) => [s.href, s]));
    expect(byHref.get("/manager/new-tab")?.children).toEqual([]);
    expect(byHref.get("/manager/new-tab")?.titleKey).toBe("nav.home");
    expect(sections.map((s) => s.href)).not.toContain("/manager/dashboard");
    expect(byHref.get("/manager/inventory")?.children.map((c) => c.href)).toEqual(["/manager/suppliers", "/manager/inventory/waste"]);
    expect(byHref.get("/manager/sales")?.children.map((c) => c.href)).toEqual(["/manager/reports", "/manager/finances"]);
    expect(byHref.get("/manager/personnel/schedule")?.children.map((c) => c.href)).toEqual([
      "/manager/personnel/schedule",
      "/manager/personnel/team",
      "/manager/personnel/roles",
      "/manager/personnel/training",
      "/manager/personnel/pay",
    ]);
    expect(byHref.get("/manager/docs")?.titleKey).toBe("nav.docs");
  });

  test("uninstalled apps and denied permissions hide sections and children", () => {
    const sections = listNavSections(ctx({ view: ["dashboard", "inventory", "sales", "staffing"], apps: ["tasks"] }));
    const hrefs = sections.map((s) => s.href);
    expect(hrefs).not.toContain("/manager/sales");
    expect(hrefs).not.toContain("/manager/apps");
    expect(hrefs).toContain("/manager/settings");
    const personnel = sections.find((s) => s.href === "/manager/personnel/schedule");
    expect(personnel?.children.map((c) => c.href)).toEqual(["/manager/personnel/schedule", "/manager/personnel/roles"]);
    // Home is the New Tab page, which needs no permission: every member keeps it.
    expect(listNavSections(ctx({ view: [] })).map((s) => s.href)).toContain("/manager/new-tab");
  });

  test("personal mode lists only the personal hrefs", () => {
    const sections = listNavSections(ctx({ owner: true, mode: "personal" }));
    expect(sections.map((s) => s.href)).toEqual(["/manager/personnel/schedule", "/manager/channel"]);
    expect(sections[0].children.map((c) => c.href)).toEqual([
      "/manager/personnel/schedule",
      "/manager/personnel/team",
      "/manager/personnel/training",
      "/manager/personnel/pay",
    ]);
  });
});

describe("searchRoutes", () => {
  test("prefix beats word start beats substring; parents are reported", () => {
    const owner = ctx({ owner: true });
    expect(searchRoutes("inv", t, owner)[0]?.href).toBe("/manager/inventory");
    const waste = searchRoutes("waste", t, owner)[0];
    expect(waste?.href).toBe("/manager/inventory/waste");
    expect(waste?.parentTitleKey).toBe("nav.inventory");
    expect(searchRoutes("log", t, owner)[0]?.href).toBe("/manager/inventory/waste");
    expect(searchRoutes("payroll", t, owner)[0]?.href).toBe("/manager/personnel/pay");
    expect(searchRoutes("   ", t, owner)).toEqual([]);
  });

  test("results are unique by href, exclude aliases and respect access and personal mode", () => {
    const owner = ctx({ owner: true });
    const home = searchRoutes("home", t, owner).map((r) => r.href);
    expect(home.filter((href) => href === "/manager/new-tab")).toHaveLength(1);
    expect(home).not.toContain("/manager");
    // The dashboard left the nav but stays searchable under its own name.
    expect(searchRoutes("dashboard", t, owner)[0]?.href).toBe("/manager/dashboard");
    expect(searchRoutes("dashboard", t, ctx({ view: ["inventory"] }))).toEqual([]);
    expect(searchRoutes("edit", t, owner).map((r) => r.href)).not.toContain("/manager/docs/edit");
    expect(searchRoutes("reports", t, ctx({ view: ["inventory"] })).map((r) => r.href)).not.toContain("/manager/reports");
    expect(searchRoutes("inventory", t, ctx({ owner: true, mode: "personal" }))).toEqual([]);
    expect(searchRoutes("schedule", t, ctx({ owner: true, mode: "personal" }))[0]?.href).toBe("/manager/personnel/schedule");
    const scores = searchRoutes("s", t, owner).map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
