import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_MODE_HOME } from "@/lib/app-mode";
import { listNavSections, searchRoutes } from "@/lib/browser-shell/access";
import { NewTabIcon, ROUTES, matchRoute, resolveLegacyRedirect, titleForUrl } from "@/lib/browser-shell/routes";
import { getShortcutBindings, type ShortcutEnv } from "@/lib/browser-shell/shortcuts";
import { HOME_URL, LAUNCH_PATHS, MANAGER_ALIAS_PATH, NEW_TAB_URL, type AccessContext } from "@/lib/browser-shell/types";
import type { Permissions } from "@/lib/types";

/*
 * Home is the New Tab page (lead decision 1): one URL for the toolbar Home button, the "/manager"
 * launch alias, APP_MODE_HOME.admin and the Home nav row. The dashboard keeps working by URL and
 * omnibox search but leaves the nav, under its own title key.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const LOCALES = ["en", "zh-cn", "zh-tw", "zh-hk", "fr", "es", "hi", "ar"] as const;

function ctx(opts: { owner?: boolean; view?: readonly (keyof Permissions)[] } = {}): AccessContext {
  const view = new Set<keyof Permissions>(opts.view ?? []);
  return {
    isOwner: opts.owner === true,
    can: (section) => opts.owner === true || view.has(section),
    installedApps: new Set(["sales", "products", "tasks", "training", "pay", "bookings"]),
    appsReady: true,
    appMode: "admin",
    personalMode: false,
    isCapacitor: false,
  };
}

const EN: Record<string, string> = {
  "nav.home": "Home",
  "nav.settings": "Settings",
  "browser.routes.dashboard": "Dashboard",
  "browser.routes.billing": "Billing",
  "browser.routes.subscribe": "Subscription",
  "browser.newTab": "New Tab",
};
const t = (key: string) => EN[key] ?? key;

function leaf(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, tree);
}

describe("home = New Tab", () => {
  test("every home entry point resolves to the same URL", () => {
    expect(HOME_URL).toBe(NEW_TAB_URL);
    expect(HOME_URL).toBe("/manager/new-tab");
    expect(APP_MODE_HOME.admin).toBe(HOME_URL);
    // Device surfaces keep their own homes.
    expect(APP_MODE_HOME.personal).toBe("/personal");
    expect(APP_MODE_HOME.store).toBe("/store");
  });

  test('"/manager" is only an alias: it redirects home and never becomes a tab URL', () => {
    expect(resolveLegacyRedirect("/manager")).toBe(HOME_URL);
    expect(resolveLegacyRedirect("/manager/")).toBe(HOME_URL);
    expect(resolveLegacyRedirect("/manager?next=1")).toBe(`${HOME_URL}?next=1`);
    // "/~" redirects through the alias in two hops.
    expect(resolveLegacyRedirect("/~")).toBe(HOME_URL);
    expect(resolveLegacyRedirect("/~/inventory")).toBe("/manager/inventory");
    // The registry still knows the alias, so a boot URL of "/manager" is a known route.
    expect(matchRoute("/manager")?.titleKey).toBe("nav.home");
  });

  test("the home page's own title is the Home label, not New Tab", () => {
    expect(matchRoute(HOME_URL)?.titleKey).toBe("nav.home");
    expect(titleForUrl(HOME_URL, undefined, t)).toBe("Home");
    expect(titleForUrl(`${HOME_URL}?q=inv`, undefined, t)).toBe("Home");
    // A page that sets its own title still wins.
    expect(titleForUrl(HOME_URL, "Anything", t)).toBe("Anything");
  });

  test("the Home nav section points home, has no sub-pages and needs no permission", () => {
    const sections = listNavSections(ctx({ owner: true }));
    expect(sections[0].href).toBe(HOME_URL);
    expect(sections[0].titleKey).toBe("nav.home");
    expect(sections[0].children).toEqual([]);
    expect(sections[0].permissionKey).toBeUndefined();
    // A member with no permissions at all still gets Home (and nothing else it can't open).
    const bare = listNavSections(ctx()).map((s) => s.href);
    expect(bare).toContain(HOME_URL);
    expect(bare).not.toContain("/manager/dashboard");
    // Exactly one section, and no duplicate hrefs anywhere.
    expect(sections.filter((s) => s.href === HOME_URL)).toHaveLength(1);
    expect(new Set(sections.map((s) => s.href)).size).toBe(sections.length);
  });

  test("the dashboard leaves the nav but keeps its own key and stays reachable", () => {
    const dashboard = ROUTES.find((r) => r.prefix === "/manager/dashboard");
    expect(dashboard?.listed).toBe(false);
    expect(dashboard?.titleKey).toBe("browser.routes.dashboard");
    expect(dashboard?.permissionKey).toBe("dashboard");
    expect(dashboard?.titleKey).not.toBe("nav.home");
    expect(matchRoute("/manager/dashboard")?.titleKey).toBe("browser.routes.dashboard");
    expect(titleForUrl("/manager/dashboard", undefined, t)).toBe("Dashboard");
    // Omnibox / New Tab search still finds it, gated by dashboard.view.
    expect(searchRoutes("dashboard", t, ctx({ owner: true }))[0]?.href).toBe("/manager/dashboard");
    expect(searchRoutes("dashboard", t, ctx({ view: ["inventory"] }))).toEqual([]);
    // "home" finds the home page, once, and never the alias.
    const home = searchRoutes("home", t, ctx({ owner: true })).map((r) => r.href);
    expect(home.filter((href) => href === HOME_URL)).toHaveLength(1);
    expect(home).not.toContain("/manager");
  });

  test("no listed route resolves to the dashboard, and only one route is the Home section", () => {
    const sections = ROUTES.filter((r) => r.section);
    expect(sections.filter((r) => (r.sectionHref ?? r.prefix) === HOME_URL)).toHaveLength(1);
    for (const route of ROUTES) {
      if (route.listed) expect(route.prefix).not.toBe("/manager/dashboard");
      if (route.parent) expect(ROUTES.some((r) => r.prefix === route.parent)).toBe(true);
    }
  });

  test("the home page and the Home nav row draw the same icon", () => {
    const section = ROUTES.find((route) => route.prefix === "/manager" && route.section);
    const page = ROUTES.find((route) => route.prefix === HOME_URL);
    expect(section?.icon).toBeDefined();
    expect(page?.icon).toBe(section?.icon);
    // The "+" affordances keep their own glyph, which no route carries any more.
    expect(page?.icon).not.toBe(NewTabIcon);
    expect(ROUTES.some((route) => route.icon === NewTabIcon)).toBe(false);
  });

  test("the home page is an app-launch path, so a landing restores the session", () => {
    // Behaviour lives in scripts/tests/browser-shell/history-bridge.isolated.ts; this pins the
    // contract bootState reads: both the alias and the home page mean "the app was opened".
    expect(LAUNCH_PATHS.has(MANAGER_ALIAS_PATH)).toBe(true);
    expect(LAUNCH_PATHS.has(HOME_URL)).toBe(true);
    expect(MANAGER_ALIAS_PATH).toBe("/manager");
    expect(resolveLegacyRedirect(MANAGER_ALIAS_PATH)).toBe(HOME_URL);
  });

  test("search offers neither the alias nor the paywall gate", () => {
    const owner = ctx({ owner: true });
    const gate = ROUTES.find((route) => route.prefix === "/manager/subscribe");
    expect(gate?.kind).toBe("gate");
    expect(searchRoutes("subscribe", t, owner)).toEqual([]);
    expect(searchRoutes("upgrade", t, owner)).toEqual([]);
    // Billing is a real page, so it stays searchable.
    expect(searchRoutes("billing", t, owner)[0]?.href).toBe("/manager/settings/billing");
  });

  test("the toggleSidebar command is bound as Alt+S in every environment", () => {
    const envs: ShortcutEnv[] = [
      { isTauri: true, isMac: true, isStandalonePwa: false, isChromium: false },
      { isTauri: true, isMac: false, isStandalonePwa: false, isChromium: false },
      { isTauri: false, isMac: true, isStandalonePwa: false, isChromium: true },
      { isTauri: false, isMac: false, isStandalonePwa: true, isChromium: true },
      { isTauri: false, isMac: false, isStandalonePwa: false, isChromium: false },
    ];
    for (const env of envs) {
      const bound = getShortcutBindings(env).filter((b) => b.command === "toggleSidebar");
      expect(bound).toHaveLength(1);
      expect(bound[0].code).toBe("KeyS");
      expect(bound[0].alt).toBe(true);
      expect(bound[0].mod).toBeUndefined();
      expect(bound[0].inEditable).toBe(false);
    }
  });

  test("every locale has the keys the home naming depends on", () => {
    for (const locale of LOCALES) {
      const messages: unknown = JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"));
      for (const key of ["nav.home", "browser.routes.dashboard", "browser.newTab"]) {
        const value = leaf(messages, key);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
      }
    }
  });
});
