// Drive's three-surface wiring (drive-ui.md §15, CONTRACTS §2.12): the built-in device catalog entry that puts the
// lite app on /store and /personal (and in their docks), the editor routes it hands to the Docs / Sheets / Slides
// plugins, the route registry rows, the search exclusions, the legacy nav, the page guards, and the labels every one
// of those shows. The editor plugins themselves are covered by scripts/tests/device/editor-plugins.test.ts.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_CATALOG,
  catalogApp,
  catalogAppForRoute,
  catalogAppOnSurface,
  catalogPageForRoute,
} from "@/components/device/app-catalog";
import { APP_ICONS, DocsIcon, DriveIcon, SheetsIcon, SlidesIcon } from "@/components/device/app-icons";
import { NOT_SEARCHABLE } from "@/lib/browser-shell/access";
import { ROUTES, matchRoute } from "@/lib/browser-shell/routes";
import {
  MANAGER_ROUTE_APPS,
  REQUIRED_DEVICE_APPS,
  appForManagerRoute,
  isManagerRouteEnabled,
  isRequiredDeviceApp,
  parseDeviceApps,
} from "@/lib/device-apps";
import { LOCALES, MESSAGES_DIR, flattenMessages, leavesOf, loadFragments } from "@/scripts/i18n/drive/fragment";

const ROOT = join(import.meta.dir, "..", "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

const DRIVE_URLS = ["/manager/drive", "/manager/drive/", "/manager/drive?space=store&folder=f", "/manager/drive?type=doc"];
/** Editor routes under Drive and the plugin that owns each. */
const EDITOR_URLS: ReadonlyArray<readonly [string, string]> = [
  ["/manager/drive/sheet?id=1", "sheets"],
  ["/manager/drive/slides?id=1&slide=2", "slides"],
];

/** The `{ id: "drive", … }` object literal of APP_CATALOG, cut out of the source by brace depth. */
function catalogEntrySource(id: string): string {
  const text = source("components/device/app-catalog.tsx");
  const start = text.indexOf(`{ id: "${id}",`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unterminated catalog entry "${id}"`);
}

describe("device catalog", () => {
  test("Drive is one catalog app on both device surfaces, gated by dashboard and docked", () => {
    const drive = catalogApp("drive");
    expect(drive).not.toBeNull();
    if (!drive) return;
    expect(APP_CATALOG.filter((app) => app.id === "drive")).toHaveLength(1);
    expect(drive.icon).toBe(DriveIcon);
    expect(APP_ICONS.drive).toBe(DriveIcon);
    expect(drive.route).toBe("/manager/drive");
    expect(drive.color).toBe("violet");
    expect(drive.permissionKey).toBe("dashboard");
    expect(drive.surfaces).toEqual(["store", "personal"]);
    // Visibility is gated by permission and install state, never by role or a missing surface.
    expect(drive.managerOnly).toBeUndefined();
    expect(drive.keepManagerPage).toBeUndefined();
    // The editors are their own plugins, not sibling pages; Drive took the dock spot Docs had.
    expect(drive.pages).toBeUndefined();
    expect(drive.editor).toBeUndefined();
    expect(drive.dockOn).toEqual(["store", "personal"]);
    expect(drive.dock).toBeUndefined();
    expect(drive.component).toBeDefined();
    expect(drive.lite).toBeDefined();
    expect(catalogAppOnSurface(drive, "store")).toBe(true);
    expect(catalogAppOnSurface(drive, "personal")).toBe(true);
    // Docs stays its own app (an editor plugin now).
    expect(catalogApp("docs")?.route).toBe("/manager/docs/edit");
    expect(catalogApp("docs")?.dockOn).toBeUndefined();
  });

  test("the lazy loaders open the Drive manager page and the DriveLite panel", () => {
    const entry = catalogEntrySource("drive");
    expect(entry).toContain(`component: lazy(() => import("@/app/manager/drive/page"))`);
    expect(entry).toContain(`lite: lite(() => import("./apps/drive").then((m) => m.DriveLite))`);
    expect(existsSync(join(ROOT, "app/manager/drive/page.tsx"))).toBe(true);
    expect(source("app/manager/drive/page.tsx")).toMatch(/export default function \w+\(/);
    const liteSource = source("components/device/apps/drive.tsx");
    expect(liteSource).toMatch(/export function DriveLite\(\{[^}]*\}: LiteAppProps\)/);
  });

  test("Drive is built in: required on every surface and never stored", () => {
    // app-store.tsx lists every catalog app that has a device UI; a required one shows as always on.
    expect(APP_CATALOG.filter((app) => app.lite || app.keepManagerPage).map((app) => app.id)).toContain("drive");
    expect(isRequiredDeviceApp("drive")).toBe(true);
    expect((REQUIRED_DEVICE_APPS as readonly string[]).includes("drive")).toBe(true);
    // Writes drop required ids, so "drive" never reaches settings.deviceApps again.
    expect(parseDeviceApps(JSON.stringify(["docs", "drive"]))).toEqual(["docs"]);
  });

  test("links to the Drive home resolve to Drive; editor links to their plugin", () => {
    for (const url of DRIVE_URLS) {
      expect(catalogAppForRoute(url)?.id).toBe("drive");
      expect(catalogPageForRoute(url)?.page.route).toBe("/manager/drive");
    }
    for (const [url, plugin] of EDITOR_URLS) {
      expect(catalogAppForRoute(url)?.id).toBe(plugin);
      expect(catalogPageForRoute(url)?.page.route).toBe(url.split("?")[0]);
    }
    expect(catalogAppForRoute("/manager/docs/edit?id=1")?.id).toBe("docs");
    expect(catalogAppForRoute("/manager/drivers")).toBeNull();
  });
});

describe("route ownership", () => {
  test("the Drive home is always on; each editor turns on with its own plugin", () => {
    expect(MANAGER_ROUTE_APPS["/manager/drive"]).toBeUndefined();
    for (const url of DRIVE_URLS) {
      expect(appForManagerRoute(url)).toBeNull();
      expect(isManagerRouteEnabled(url, [])).toBe(true);
    }
    for (const [url, plugin] of EDITOR_URLS) {
      expect(appForManagerRoute(url)).toBe(plugin);
      expect(isManagerRouteEnabled(url, [])).toBe(false);
      // A bare "drive" in a list is no longer enough: only the settings-row reader expands it (legacy orgs).
      expect(isManagerRouteEnabled(url, ["drive", "docs"])).toBe(false);
      expect(isManagerRouteEnabled(url, [plugin])).toBe(true);
      expect(isManagerRouteEnabled(url, new Set([plugin]))).toBe(true);
      // The owning app id is the catalog id, so the store entry and the route turn on together.
      expect(catalogApp(plugin)?.route).toBe(url.split("?")[0]);
    }
    expect(appForManagerRoute("/manager/drivers")).toBeNull();
    expect(appForManagerRoute("/manager/docs/edit")).toBe("docs");
    expect(isManagerRouteEnabled("/manager/docs/edit", ["sheets", "slides"])).toBe(false);
    // The old Docs home is an always-on alias of Drive's documents view.
    expect(appForManagerRoute("/manager/docs")).toBeNull();
    expect(isManagerRouteEnabled("/manager/docs", [])).toBe(true);
  });
});

describe("route registry", () => {
  test("the Drive home is a listed section; the Docs alias and every editor are unlisted children", () => {
    const home = matchRoute("/manager/drive?space=my");
    expect(home?.prefix).toBe("/manager/drive");
    expect(home?.exact).toBe(true);
    expect(home?.listed).toBe(true);
    expect(home?.section).toBe(true);
    expect(home?.titleKey).toBe("nav.drive");
    expect(home?.icon).toBe(DriveIcon);
    expect(home?.permissionKey).toBe("dashboard");
    expect(home?.previewKind).toBe("grid");
    // Folder, member, preview, search: navigation state the page restores, never one-shot.
    expect(home?.volatileParams).toBeUndefined();

    const sheet = matchRoute("/manager/drive/sheet?id=1&new=1");
    expect(sheet?.prefix).toBe("/manager/drive/sheet");
    expect(sheet?.titleKey).toBe("nav.sheets");
    expect(sheet?.icon).toBe(SheetsIcon);
    expect(sheet?.listed).toBe(false);
    expect(sheet?.parent).toBe("/manager/drive");
    expect(sheet?.mobileChrome).toBe("docked");
    expect(sheet?.previewKind).toBe("grid");
    expect(sheet?.volatileParams).toEqual(["new", "version"]);

    const slides = matchRoute("/manager/drive/slides?id=1&present=1");
    expect(slides?.prefix).toBe("/manager/drive/slides");
    expect(slides?.titleKey).toBe("nav.slides");
    expect(slides?.icon).toBe(SlidesIcon);
    expect(slides?.listed).toBe(false);
    expect(slides?.parent).toBe("/manager/drive");
    expect(slides?.mobileChrome).toBe("docked");
    expect(slides?.previewKind).toBe("doc");
    expect(slides?.volatileParams).toEqual(["new", "slide", "version", "present"]);

    // The old Docs home is an alias of Drive's documents view, no longer a section of its own.
    const docsHome = matchRoute("/manager/docs");
    expect(docsHome?.prefix).toBe("/manager/docs");
    expect(docsHome?.listed).toBe(false);
    expect(docsHome?.section).toBeUndefined();
    expect(docsHome?.parent).toBe("/manager/drive");
    const docEditor = matchRoute("/manager/docs/edit?id=1");
    expect(docEditor?.prefix).toBe("/manager/docs/edit");
    expect(docEditor?.icon).toBe(DocsIcon);
    expect(docEditor?.listed).toBe(false);
    expect(docEditor?.parent).toBe("/manager/drive");

    for (const row of [home, sheet, slides, docsHome, docEditor]) expect(row?.permissionKey).toBe("dashboard");
    expect(home?.keywords).toEqual(expect.arrayContaining(["docs", "documents", "spreadsheets", "presentations"]));
    expect(matchRoute("/manager/drive/other")).toBeNull();
  });

  test("the editors need an id, so search never offers them; the home is searchable", () => {
    expect(NOT_SEARCHABLE.has("/manager/drive/sheet")).toBe(true);
    expect(NOT_SEARCHABLE.has("/manager/drive/slides")).toBe(true);
    expect(NOT_SEARCHABLE.has("/manager/drive")).toBe(false);
  });

  test("every Drive page is guarded by the dashboard section its route declares", () => {
    for (const page of ["app/manager/drive/page.tsx", "app/manager/drive/sheet/page.tsx", "app/manager/drive/slides/page.tsx"]) {
      const guards = Array.from(source(page).matchAll(/<PermissionGuard\s+section=["'](\w+)["']/g), (m) => m[1]);
      expect([page, guards]).toEqual([page, ["dashboard"]]);
    }
  });
});

describe("legacy shell", () => {
  const DRIVE_ROW = `{ labelKey: "nav.drive", href: "/manager/drive", icon: DriveIcon, permissionKey: "dashboard" }`;

  test("the bottom bar lists Drive and no Docs row, gated like its route", () => {
    const text = source("components/bottom-bar.tsx");
    expect(text).toContain(DRIVE_ROW);
    expect(text).not.toContain(`href: "/manager/docs"`);
    expect(text).toMatch(/import \{[^}]*\bDriveIcon\b[^}]*\} from "@\/components\/device\/app-icons"/);
  });

  test("the legacy sidebar's files row is Drive", () => {
    const text = source("components/sidebar.tsx");
    expect(text).toContain(DRIVE_ROW);
    expect(text).not.toContain(`href: "/manager/docs"`);
  });
});

describe("labels", () => {
  test("every label the wiring shows exists in all 8 locales (messages or a Drive fragment)", () => {
    const keys = new Set(["device.catalog.drive", "device.catalogDesc.drive", "nav.drive"]);
    for (const row of ROUTES) if (row.prefix === "/manager/drive" || row.parent === "/manager/drive") keys.add(row.titleKey);
    expect([...keys].sort()).toEqual(["device.catalog.drive", "device.catalogDesc.drive", "nav.docs", "nav.drive", "nav.sheets", "nav.slides"]);

    const fragments = loadFragments();
    const missing: string[] = [];
    for (const locale of LOCALES) {
      const known = flattenMessages(JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")));
      for (const fragment of fragments) for (const [key, value] of leavesOf(fragment, locale)) known.set(key, value);
      for (const key of keys) if (!known.get(key)?.trim()) missing.push(`${locale}:${key}`);
    }
    expect(missing).toEqual([]);
  });
});
