import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTES, matchRoute, prettifyPathSegment, resolveLegacyRedirect, titleForUrl } from "@/lib/browser-shell/routes";

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("matchRoute", () => {
  test("exact routes match only their own path", () => {
    expect(matchRoute("/manager")?.titleKey).toBe("nav.home");
    expect(matchRoute("/manager/")?.titleKey).toBe("nav.home");
    expect(matchRoute("/manager/docs")?.prefix).toBe("/manager/docs");
    expect(matchRoute("/manager/docs/unknown")).toBeNull();
    expect(matchRoute("/manager/new-tab")?.titleKey).toBe("nav.home");
    expect(matchRoute("/manager/new-tab/extra")).toBeNull();
  });

  test("the docs editor is its own route, not the docs home", () => {
    const editor = matchRoute("/manager/docs/edit");
    expect(editor?.prefix).toBe("/manager/docs/edit");
    expect(editor?.mobileChrome).toBe("docked");
    expect(editor?.previewKind).toBe("doc");
    expect(matchRoute("/manager/docs/edit?id=1")?.prefix).toBe("/manager/docs/edit");
  });

  test("longest prefix wins, on segment boundaries", () => {
    expect(matchRoute("/manager/inventory/waste")?.titleKey).toBe("nav.wasteLog");
    expect(matchRoute("/manager/inventory/waste/2026")?.titleKey).toBe("nav.wasteLog");
    expect(matchRoute("/manager/inventory/123")?.titleKey).toBe("nav.inventory");
    expect(matchRoute("/manager/inventoryx")).toBeNull();
    expect(matchRoute("/manager/personnel/team/member")?.titleKey).toBe("personnel.tabs.team");
    expect(matchRoute("/manager/settings/billing")?.titleKey).toBe("browser.routes.billing");
    expect(matchRoute("/manager/settings")?.titleKey).toBe("nav.settings");
    expect(matchRoute("/manager/unknown")).toBeNull();
  });

  test("the subscribe paywall is a non-persisted gate", () => {
    const gate = matchRoute("/manager/subscribe");
    expect(gate?.kind).toBe("gate");
    expect(gate?.persist).toBe(false);
  });
});

describe("resolveLegacyRedirect", () => {
  test("mirrors next.config redirects and page-level redirects", () => {
    expect(resolveLegacyRedirect("/manager/chat")).toBe("/manager/channel");
    expect(resolveLegacyRedirect("/manager/chat/abc?x=1")).toBe("/manager/channel/abc?x=1");
    expect(resolveLegacyRedirect("/manager/personnel")).toBe("/manager/personnel/schedule");
    expect(resolveLegacyRedirect("/manager/staffing")).toBe("/manager/personnel/schedule");
    expect(resolveLegacyRedirect("/manager/training")).toBe("/manager/personnel/schedule");
    expect(resolveLegacyRedirect("/manager/usage")).toBe("/manager/settings");
    // "/manager" is the home alias, so "/~" redirects through it in two hops.
    expect(resolveLegacyRedirect("/manager")).toBe("/manager/new-tab");
    expect(resolveLegacyRedirect("/manager/?q=1")).toBe("/manager/new-tab?q=1");
    expect(resolveLegacyRedirect("/~")).toBe("/manager/new-tab");
    expect(resolveLegacyRedirect("/~/inventory")).toBe("/manager/inventory");
  });

  test("returns the same string when nothing applies", () => {
    const url = "/manager/inventory?b=1";
    expect(resolveLegacyRedirect(url)).toBe(url);
    expect(resolveLegacyRedirect("/manager/personnel/schedule")).toBe("/manager/personnel/schedule");
  });
});

describe("titles", () => {
  const t = (key: string) => `T(${key})`;

  test("page title beats the registry, registry beats the path", () => {
    expect(titleForUrl("/manager/docs/edit?id=1", "  Opening   checklist ", t)).toBe("Opening checklist");
    expect(titleForUrl("/manager/inventory", undefined, t)).toBe("T(nav.inventory)");
    expect(titleForUrl("/manager/new-tab", undefined, t)).toBe("T(nav.home)");
    expect(titleForUrl("/manager/some-page", undefined, t)).toBe("Some page");
    expect(titleForUrl("/manager/", "", t)).toBe("T(nav.home)");
  });

  test("prettifyPathSegment decodes and humanizes the last segment", () => {
    expect(prettifyPathSegment("/manager/waste_log-2026")).toBe("Waste log 2026");
    expect(prettifyPathSegment("/manager/caf%C3%A9")).toBe("Café");
    expect(prettifyPathSegment("/")).toBe("");
  });
});

describe("registry", () => {
  test("prefixes are unique, canonical and under /manager", () => {
    const seen = new Set<string>();
    for (const route of ROUTES) {
      expect(route.prefix === "/manager" || route.prefix.startsWith("/manager/")).toBe(true);
      expect(route.prefix.endsWith("/") && route.prefix !== "/").toBe(false);
      expect(seen.has(route.prefix)).toBe(false);
      seen.add(route.prefix);
    }
  });

  test("parents exist and sections are listed", () => {
    const prefixes = new Set(ROUTES.map((route) => route.prefix));
    for (const route of ROUTES) {
      if (route.parent) expect(prefixes.has(route.parent)).toBe(true);
      if (route.section) expect(route.listed).toBe(true);
    }
  });

  test("every PermissionGuard section on a route's page or layout is one of its permission keys", () => {
    const guardSections = (file: string): string[] => {
      if (!existsSync(file)) return [];
      const text = readFileSync(file, "utf8");
      return Array.from(text.matchAll(/<PermissionGuard\s+section=["'](\w+)["']/g), (m) => m[1]);
    };
    const mismatches: string[] = [];
    for (const route of ROUTES) {
      const segments = route.prefix.split("/").filter(Boolean);
      const sections = new Set<string>();
      for (let depth = 2; depth <= segments.length; depth++) {
        for (const section of guardSections(join(ROOT, "app", ...segments.slice(0, depth), "layout.tsx"))) sections.add(section);
      }
      for (const section of guardSections(join(ROOT, "app", ...segments, "page.tsx"))) sections.add(section);
      const keys = new Set([route.permissionKey, route.extraPermissionKey].filter((key): key is NonNullable<typeof key> => !!key));
      for (const section of sections) {
        if (!keys.has(section as never)) mismatches.push(`${route.prefix}: guard "${section}" not in [${[...keys].join(", ")}]`);
      }
      if (sections.size > 0 && route.permissionKey && !sections.has(route.permissionKey)) {
        mismatches.push(`${route.prefix}: permissionKey "${route.permissionKey}" but guards [${[...sections].join(", ")}]`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
