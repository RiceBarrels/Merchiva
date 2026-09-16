import { describe, expect, test } from "bun:test";
import { CHROME, CHROME_COARSE, SIDEBAR_RAIL_SLOP, isSidebarRail } from "@/components/browser-shell/desktop/chrome-geometry";
import {
  activeSectionHref,
  isRowActive,
  isSectionRowActive,
  navKeyOf,
  sectionKeyOf,
  splitSidebarSections,
  toggleExpanded,
  withExpanded,
} from "@/components/browser-shell/desktop/sidebar/sidebar-nav";
import type { NavSection } from "@/lib/browser-shell";
import {
  DEFAULT_SIDEBAR_STATE,
  parseSidebarState,
  serializeSidebarState,
} from "@/components/browser-shell/desktop/sidebar/sidebar-state";
import type { AppMode } from "@/lib/app-mode";
import { listNavSections } from "@/lib/browser-shell/access";
import type { AccessContext } from "@/lib/browser-shell/types";
import type { Permissions } from "@/lib/types";

type Section = keyof Permissions;

const ALL_APPS = ["sales", "products", "tasks", "training", "pay", "bookings"];

/** Same access-context stand-in as scripts/tests/browser-shell/access.test.ts. */
function ctx(
  opts: { owner?: boolean; view?: readonly Section[]; apps?: readonly string[]; mode?: AppMode | null } = {},
): AccessContext {
  const view = new Set<Section>(opts.view ?? []);
  const mode = opts.mode === undefined ? "admin" : opts.mode;
  return {
    isOwner: opts.owner === true,
    can: (section) => opts.owner === true || view.has(section),
    installedApps: new Set(opts.apps ?? ALL_APPS),
    appsReady: true,
    appMode: mode,
    personalMode: mode === "personal",
    isCapacitor: false,
  };
}

/**
 * The rows that carry `aria-current="page"` for one URL, mirroring how sidebar.tsx renders:
 * sub-pages exist only while their section is expanded and the sidebar is not the icon rail.
 * `expanded` defaults to every section open (the auto-expand of the active section).
 */
function currentRows(
  sections: readonly NavSection[],
  activeUrl: string,
  opts: { collapsed?: boolean; expanded?: ReadonlySet<string> } = {},
): string[] {
  const collapsed = opts.collapsed === true;
  const expanded = opts.expanded ?? new Set(sections.map((section) => section.href));
  const { primary, pinned } = splitSidebarSections(sections);
  const activeSection = activeSectionHref(sections, activeUrl);
  const rows: string[] = [];
  for (const section of primary) {
    const childrenVisible = !collapsed && expanded.has(section.href) && section.children.length > 0;
    if (isSectionRowActive(section, activeUrl, activeSection, childrenVisible)) rows.push(section.href);
    if (!childrenVisible) continue;
    for (const child of section.children) if (isRowActive(child.href, activeUrl)) rows.push(child.href);
  }
  // Pinned rows never render sub-pages.
  for (const section of pinned) {
    if (isSectionRowActive(section, activeUrl, activeSection, false)) rows.push(section.href);
  }
  return rows;
}

describe("sidebar geometry", () => {
  test("the rail is narrower than the smallest expanded sidebar, which fits inside the drag range", () => {
    expect(CHROME.SIDEBAR_RAIL_W).toBeLessThan(CHROME.SIDEBAR_MIN_W);
    expect(CHROME.SIDEBAR_MIN_W).toBeLessThanOrEqual(CHROME.SIDEBAR_W);
    expect(CHROME.SIDEBAR_W).toBeLessThanOrEqual(CHROME.SIDEBAR_MAX_W);
    // The legacy desktop shell's panel (components/sidebar.tsx MobileShell): 140-360px.
    expect(CHROME.SIDEBAR_MIN_W).toBe(140);
    expect(CHROME.SIDEBAR_MAX_W).toBe(360);
  });

  test("coarse density widens the rail and the default width, keeping touch targets ≥ 36px", () => {
    expect(CHROME_COARSE.SIDEBAR_RAIL_W).toBeGreaterThan(CHROME.SIDEBAR_RAIL_W);
    expect(CHROME_COARSE.SIDEBAR_W).toBeGreaterThanOrEqual(CHROME.SIDEBAR_W);
    expect(CHROME_COARSE.SIDEBAR_RAIL_W).toBeGreaterThanOrEqual(36);
  });

  test("isSidebarRail only reports the collapsed panel, with drag slop", () => {
    expect(isSidebarRail(CHROME.SIDEBAR_RAIL_W)).toBe(true);
    expect(isSidebarRail(CHROME.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP)).toBe(true);
    expect(isSidebarRail(CHROME.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP + 1)).toBe(false);
    expect(isSidebarRail(CHROME.SIDEBAR_MIN_W)).toBe(false);
    expect(isSidebarRail(CHROME.SIDEBAR_W)).toBe(false);
    // The coarse rail is wider, so its threshold sits higher too.
    expect(isSidebarRail(CHROME_COARSE.SIDEBAR_RAIL_W, CHROME_COARSE)).toBe(true);
    expect(isSidebarRail(CHROME_COARSE.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP, CHROME_COARSE)).toBe(true);
    expect(isSidebarRail(CHROME_COARSE.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP + 1, CHROME_COARSE)).toBe(false);
    expect(isSidebarRail(CHROME_COARSE.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP, CHROME)).toBe(false);
  });

  test("the page region keeps a usable minimum width while the sidebar is dragged", () => {
    expect(CHROME.CONTENT_MIN_W).toBeGreaterThanOrEqual(360);
    expect(CHROME.SIDEBAR_MAX_W + CHROME.CONTENT_MIN_W).toBeLessThanOrEqual(1024);
  });
});

describe("sidebar nav rows", () => {
  test("a row is keyed by its registry route, so deep pages still light up their row", () => {
    expect(navKeyOf("/manager/inventory")).toBe("/manager/inventory");
    expect(navKeyOf("/manager/personnel/team/42")).toBe("/manager/personnel/team");
    expect(navKeyOf("/manager/inventory?filter=low")).toBe("/manager/inventory");
    expect(navKeyOf("/manager/nowhere")).toBe("/manager/nowhere");
    expect(isRowActive("/manager/inventory", "/manager/inventory?filter=low")).toBe(true);
    expect(isRowActive("/manager/inventory", "/manager/inventory/waste")).toBe(false);
    expect(isRowActive("/manager/personnel/team", "/manager/personnel/team/42")).toBe(true);
  });

  test("sub-pages resolve to their owning section", () => {
    expect(sectionKeyOf("/manager/inventory/waste")).toBe("/manager/inventory");
    expect(sectionKeyOf("/manager/suppliers")).toBe("/manager/inventory");
    expect(sectionKeyOf("/manager/reports")).toBe("/manager/sales");
    expect(sectionKeyOf("/manager/settings")).toBe("/manager/settings");
    expect(sectionKeyOf("/manager/nowhere")).toBeNull();
  });

  test("the active section is the one holding the active tab's URL", () => {
    const sections = listNavSections(ctx({ owner: true }));
    expect(activeSectionHref(sections, "/manager/new-tab")).toBe("/manager/new-tab");
    expect(activeSectionHref(sections, "/manager/inventory/waste")).toBe("/manager/inventory");
    expect(activeSectionHref(sections, "/manager/personnel/team")).toBe("/manager/personnel/schedule");
    expect(activeSectionHref(sections, "/manager/settings")).toBe("/manager/settings");
    // Pages outside the nav (the dashboard is unlisted now) highlight nothing.
    expect(activeSectionHref(sections, "/manager/dashboard")).toBeNull();
    expect(activeSectionHref(sections, "/manager/nowhere")).toBeNull();
  });

  test("Settings is pinned to the bottom and the rest keeps the registry order", () => {
    const { primary, pinned } = splitSidebarSections(listNavSections(ctx({ owner: true })));
    expect(pinned.map((section) => section.href)).toEqual(["/manager/settings"]);
    expect(primary.map((section) => section.href)).toEqual([
      "/manager/new-tab",
      "/manager/docs",
      "/manager/inventory",
      "/manager/sales",
      "/manager/personnel/schedule",
      "/manager/channel",
      "/manager/apps",
    ]);
  });

  test("gating comes from the core registry: permissions, device apps and personal mode", () => {
    const staff = splitSidebarSections(listNavSections(ctx({ view: ["inventory"], apps: [] })));
    expect(staff.primary.map((section) => section.href)).toEqual(["/manager/new-tab", "/manager/inventory"]);
    expect(staff.pinned.map((section) => section.href)).toEqual(["/manager/settings"]);

    const personal = splitSidebarSections(listNavSections(ctx({ owner: true, mode: "personal" })));
    expect(personal.primary.map((section) => section.href)).toEqual(["/manager/personnel/schedule", "/manager/channel"]);
    expect(personal.pinned).toEqual([]);
  });

  test("sections carry their sub-pages; Home and Channel are flat rows", () => {
    const sections = listNavSections(ctx({ owner: true }));
    const byHref = new Map(sections.map((section) => [section.href, section]));
    expect(byHref.get("/manager/new-tab")?.children).toEqual([]);
    expect(byHref.get("/manager/channel")?.children).toEqual([]);
    expect(byHref.get("/manager/sales")?.children.map((child) => child.href)).toEqual([
      "/manager/reports",
      "/manager/finances",
    ]);
  });

  test("exactly one row is current, on section pages and listed sub-pages alike", () => {
    const sections = listNavSections(ctx({ owner: true }));
    expect(currentRows(sections, "/manager/inventory?filter=low")).toEqual(["/manager/inventory"]);
    expect(currentRows(sections, "/manager/inventory/waste")).toEqual(["/manager/inventory/waste"]);
    expect(currentRows(sections, "/manager/personnel/team/42")).toEqual(["/manager/personnel/team"]);
    // The schedule row is both a section href and one of its own sub-pages: the child wins, once.
    expect(currentRows(sections, "/manager/personnel/schedule")).toEqual(["/manager/personnel/schedule"]);
  });

  test("an unlisted sub-route lights the section that owns it (docs editor, billing)", () => {
    const sections = listNavSections(ctx({ owner: true }));
    // Neither route is listed, so neither can appear as a child row — the section has to carry it.
    expect(sections.find((section) => section.href === "/manager/docs")?.children).toEqual([]);
    expect(currentRows(sections, "/manager/docs/edit?id=abc")).toEqual(["/manager/docs"]);
    expect(currentRows(sections, "/manager/settings/billing")).toEqual(["/manager/settings"]);
    // Pages outside the nav still light nothing.
    expect(currentRows(sections, "/manager/dashboard")).toEqual([]);
    expect(currentRows(sections, "/manager/nowhere")).toEqual([]);
  });

  test("a section whose sub-pages are off screen carries its active child's highlight", () => {
    const sections = listNavSections(ctx({ owner: true }));
    const closed = new Set(sections.map((section) => section.href).filter((href) => href !== "/manager/inventory"));
    // Closed by the user …
    expect(currentRows(sections, "/manager/inventory/waste", { expanded: closed })).toEqual(["/manager/inventory"]);
    // … and the icon rail, which never renders sub-pages.
    expect(currentRows(sections, "/manager/inventory/waste", { collapsed: true })).toEqual(["/manager/inventory"]);
    expect(currentRows(sections, "/manager/personnel/team/42", { collapsed: true })).toEqual([
      "/manager/personnel/schedule",
    ]);
  });
});

describe("expanded sections", () => {
  test("auto-expand adds the active section and keeps the identity when nothing changes", () => {
    const empty: ReadonlySet<string> = new Set();
    const one = withExpanded(empty, "/manager/inventory");
    expect(Array.from(one)).toEqual(["/manager/inventory"]);
    expect(withExpanded(one, "/manager/inventory")).toBe(one);
    expect(withExpanded(one, null)).toBe(one);
    // Never collapses another section.
    expect(Array.from(withExpanded(one, "/manager/sales")).sort()).toEqual(["/manager/inventory", "/manager/sales"]);
  });

  test("the chevron flips one section", () => {
    const opened = toggleExpanded(new Set(), "/manager/sales");
    expect(opened.has("/manager/sales")).toBe(true);
    expect(toggleExpanded(opened, "/manager/sales").has("/manager/sales")).toBe(false);
    expect(Array.from(toggleExpanded(opened, "/manager/inventory")).sort()).toEqual([
      "/manager/inventory",
      "/manager/sales",
    ]);
  });
});

describe("sidebar state persistence", () => {
  test("the default is a visible, expanded sidebar, shared as one frozen object", () => {
    expect(DEFAULT_SIDEBAR_STATE).toEqual({ hidden: false, collapsed: false });
    expect(parseSidebarState(null)).toBe(DEFAULT_SIDEBAR_STATE);
    expect(Object.isFrozen(DEFAULT_SIDEBAR_STATE)).toBe(true);
  });

  test("round-trips through the versioned storage value", () => {
    for (const state of [
      { hidden: false, collapsed: false },
      { hidden: true, collapsed: false },
      { hidden: false, collapsed: true },
      { hidden: true, collapsed: true },
    ] as const) {
      expect(parseSidebarState(serializeSidebarState(state))).toEqual(state);
    }
    expect(JSON.parse(serializeSidebarState({ hidden: true, collapsed: false }))).toEqual({
      v: 1,
      hidden: true,
      collapsed: false,
    });
  });

  test("anything unreadable or from another version falls back to the default", () => {
    for (const raw of ["", "not json", "[]", "null", "42", '"hidden"', '{"hidden":true}', '{"v":2,"hidden":true}']) {
      expect(parseSidebarState(raw)).toBe(DEFAULT_SIDEBAR_STATE);
    }
    // Unknown fields are ignored, and non-boolean values never read as true.
    expect(parseSidebarState('{"v":1,"hidden":"yes","collapsed":1,"extra":true}')).toBe(DEFAULT_SIDEBAR_STATE);
    expect(parseSidebarState('{"v":1,"hidden":true,"collapsed":"no"}')).toEqual({ hidden: true, collapsed: false });
  });
});
