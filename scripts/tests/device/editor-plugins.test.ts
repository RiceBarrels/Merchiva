// Docs, Sheets and Slides as editor plugins of Drive (lib/device-apps.ts, components/device/app-catalog.tsx): the
// kind → plugin map, the legacy read rule that gives pre-split Drive orgs both editors (and lets an uninstall stick
// after the first write), the editor routes each plugin owns, and the catalog entries: no device tile, listed in the
// plugin store, "Open" landing on Drive's view of that kind.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_CATALOG, catalogApp, catalogAppForRoute, catalogAppOnSurface } from "@/components/device/app-catalog";
import { APP_ICONS, DocsIcon, SheetsIcon, SlidesIcon } from "@/components/device/app-icons";
import { useDeviceAppEntries, type DeviceAppEntry } from "@/components/device/apps/app-store";
import {
  EDITOR_KINDS,
  EDITOR_PLUGINS,
  appForManagerRoute,
  deviceAppsFromSettingsRow,
  editorPluginOf,
  isDeviceAppInstalled,
  isEditorInstalled,
  isManagerRouteEnabled,
  isRequiredDeviceApp,
  parseDeviceApps,
  type EditorKind,
} from "@/lib/device-apps";
import { documentFileHref, driveKindHref } from "@/lib/drive/hrefs";
import { FEATURED_PLUGINS, pluginCategory } from "@/lib/plugin-store";

const ROOT = join(import.meta.dir, "..", "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");
const ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";

/** What the settings row holds after a write: lib/spacetimedb/actions.ts setDeviceApps. */
const stored = (ids: string[]) => JSON.stringify(parseDeviceApps(ids));
/** What the client reads back: lib/spacetimedb/hooks/useDeviceApps.ts. */
const read = (deviceApps: string | undefined) => deviceAppsFromSettingsRow({ organizationId: "org", deviceApps });
/** One install / uninstall, built like useDeviceApps.setInstalled: a full list on top of what was read. */
const toggle = (base: string[], id: string, on: boolean) => (on ? [...base.filter((x) => x !== id), id] : base.filter((x) => x !== id));

describe("editor kinds", () => {
  test("each kind has its own plugin id", () => {
    expect(EDITOR_KINDS).toEqual(["doc", "sheet", "slides"]);
    expect(EDITOR_PLUGINS).toEqual({ doc: "docs", sheet: "sheets", slides: "slides" });
    for (const kind of EDITOR_KINDS) expect(editorPluginOf(kind)).toBe(EDITOR_PLUGINS[kind]);
  });

  test("isEditorInstalled reads a list or a set, per kind", () => {
    expect(isEditorInstalled("sheet", ["sheets"])).toBe(true);
    expect(isEditorInstalled("sheet", new Set(["sheets"]))).toBe(true);
    expect(isEditorInstalled("slides", ["sheets"])).toBe(false);
    expect(isEditorInstalled("doc", new Set(["sheets", "slides"]))).toBe(false);
    expect(isEditorInstalled("doc", ["docs"])).toBe(true);
    for (const kind of EDITOR_KINDS) {
      expect(isEditorInstalled(kind, [])).toBe(false);
      // Drive is built in, but it never stands in for an editor once the list is read.
      expect(isEditorInstalled(kind, ["drive"])).toBe(false);
      expect(isRequiredDeviceApp(editorPluginOf(kind))).toBe(false);
    }
    expect(isDeviceAppInstalled("drive", [])).toBe(true);
  });
});

describe("legacy Drive orgs", () => {
  test("a stored list that still holds drive reads as both editors installed", () => {
    expect(read(JSON.stringify(["docs", "drive", "tasks"]))).toEqual(["docs", "tasks", "sheets", "slides"]);
    expect(read(JSON.stringify(["drive"]))).toEqual(["sheets", "slides"]);
    // Never twice, whatever the stored order.
    expect(read(JSON.stringify(["slides", "drive", "sheets", "drive"]))).toEqual(["slides", "sheets"]);
  });

  test("a list without drive is read as stored", () => {
    expect(read(JSON.stringify(["docs", "tasks"]))).toEqual(["docs", "tasks"]);
    expect(read(JSON.stringify(["sheets"]))).toEqual(["sheets"]);
    expect(read(JSON.stringify([]))).toEqual([]);
    expect(read(undefined)).toEqual([]);
    expect(read("not json")).toEqual([]);
    expect(read(JSON.stringify({ drive: true }))).toEqual([]);
    expect(deviceAppsFromSettingsRow(null)).toEqual([]);
    expect(deviceAppsFromSettingsRow({ organizationId: "org" })).toEqual([]);
  });

  test("the first write materializes the editors and drops drive; an uninstall then sticks", () => {
    // A pre-split org: Drive and Docs installed.
    let raw = JSON.stringify(["drive", "docs"]);
    let installed = read(raw);
    expect(installed).toEqual(["docs", "sheets", "slides"]);

    // Any write (here: installing Sales) stores the editors explicitly, and "drive" is gone for good.
    raw = stored(toggle(installed, "sales", true));
    expect(JSON.parse(raw)).toEqual(["docs", "sheets", "slides", "sales"]);
    installed = read(raw);
    expect(installed).toEqual(["docs", "sheets", "slides", "sales"]);

    // Uninstalling Sheets now sticks: nothing brings it back on the next read.
    raw = stored(toggle(installed, "sheets", false));
    installed = read(raw);
    expect(installed).toEqual(["docs", "slides", "sales"]);
    expect(isEditorInstalled("sheet", installed)).toBe(false);
    expect(isEditorInstalled("slides", installed)).toBe(true);
    expect(isManagerRouteEnabled("/manager/drive/sheet?id=1", installed)).toBe(false);
  });

  test("new orgs start with no editor", () => {
    const installed = read(stored(toggle(read(undefined), "tasks", true)));
    for (const kind of EDITOR_KINDS) expect(isEditorInstalled(kind, installed)).toBe(false);
  });

  test("the rule lives on the read path only: writes go through parseDeviceApps, reads through the row reader", () => {
    expect(parseDeviceApps(JSON.stringify(["drive", "docs"]))).toEqual(["docs"]);
    expect(source("lib/spacetimedb/actions.ts")).toContain("JSON.stringify(parseDeviceApps(ids))");
    expect(source("lib/spacetimedb/hooks/useDeviceApps.ts")).toContain("deviceAppsFromSettingsRow(settingsRow)");
  });
});

describe("editor routes", () => {
  test("every editor link belongs to its kind's plugin", () => {
    for (const kind of EDITOR_KINDS) {
      const plugin = editorPluginOf(kind);
      for (const href of [documentFileHref({ id: ID, fileType: kind }), documentFileHref({ id: ID, fileType: kind }, { isNew: true, comment: "t1" })]) {
        expect(appForManagerRoute(href)).toBe(plugin);
        expect(isManagerRouteEnabled(href, [])).toBe(false);
        expect(isManagerRouteEnabled(href, [plugin])).toBe(true);
        for (const other of EDITOR_KINDS) if (other !== kind) expect(isManagerRouteEnabled(href, [editorPluginOf(other)])).toBe(false);
        expect(catalogAppForRoute(href)?.id).toBe(plugin);
      }
    }
  });

  test("the old Docs home and Drive's own views are always on; the Docs editor belongs to Docs", () => {
    for (const href of ["/manager/docs", "/manager/docs?scope=trash"]) {
      expect(appForManagerRoute(href)).toBeNull();
      expect(isManagerRouteEnabled(href, [])).toBe(true);
    }
    expect(appForManagerRoute("/manager/docs/edit")).toBe("docs");
    expect(isManagerRouteEnabled("/manager/docs/edit", [])).toBe(false);
    for (const kind of EDITOR_KINDS) {
      expect(appForManagerRoute(driveKindHref(kind))).toBeNull();
      expect(isManagerRouteEnabled(driveKindHref(kind), [])).toBe(true);
    }
  });
});

const EXPECTED: ReadonlyArray<{ kind: EditorKind; id: string; route: string; color: string; icon: unknown; page: string }> = [
  { kind: "doc", id: "docs", route: "/manager/docs/edit", color: "amber", icon: DocsIcon, page: "@/app/manager/docs/edit/page" },
  { kind: "sheet", id: "sheets", route: "/manager/drive/sheet", color: "lime", icon: SheetsIcon, page: "@/app/manager/drive/sheet/page" },
  { kind: "slides", id: "slides", route: "/manager/drive/slides", color: "fuchsia", icon: SlidesIcon, page: "@/app/manager/drive/slides/page" },
];

/** The `{ id: "<id>", … }` object literal of APP_CATALOG, cut out of the source by brace depth. */
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

describe("catalog", () => {
  test("the three editor entries, and no other app is an editor", () => {
    expect(APP_CATALOG.filter((app) => app.editor).map((app) => [app.id, app.editor])).toEqual([
      ["docs", "doc"],
      ["sheets", "sheet"],
      ["slides", "slides"],
    ]);
    for (const want of EXPECTED) {
      const app = catalogApp(want.id);
      expect(app).not.toBeNull();
      if (!app) continue;
      expect(app.editor).toBe(want.kind);
      expect(editorPluginOf(want.kind)).toBe(app.id);
      expect(app.route).toBe(want.route);
      expect(app.color).toBe(want.color);
      expect(app.icon).toBe(want.icon);
      expect(APP_ICONS[app.id]).toBe(want.icon);
      expect(app.permissionKey).toBe("dashboard");
      expect(app.surfaces).toEqual(["store", "personal"]);
      expect(app.managerOnly).toBeUndefined();
      // The route the plugin owns is the catalog route, so installing it turns that page on.
      expect(appForManagerRoute(app.route)).toBe(app.id);
      expect(catalogEntrySource(app.id)).toContain(`component: lazy(() => import("${want.page}"))`);
    }
  });

  test("an editor plugin has no tile, no dock spot and no lite app; Drive hosts it", () => {
    for (const want of EXPECTED) {
      const app = catalogApp(want.id);
      if (!app) throw new Error(want.id);
      expect(app.lite).toBeUndefined();
      expect(app.keepManagerPage).toBeUndefined();
      expect(app.dockOn).toBeUndefined();
      expect(app.dock).toBeUndefined();
      expect(catalogAppOnSurface(app, "store")).toBe(false);
      expect(catalogAppOnSurface(app, "personal")).toBe(false);
    }
    const drive = catalogApp("drive");
    expect(drive && catalogAppOnSurface(drive, "store") && catalogAppOnSurface(drive, "personal")).toBe(true);
  });

  test("the files apps sit together: docs, drive, sheets, slides", () => {
    const ids = APP_CATALOG.map((app) => app.id);
    const at = ids.indexOf("docs");
    expect(ids.slice(at, at + 4)).toEqual(["docs", "drive", "sheets", "slides"]);
  });
});

function Probe({ onEntries }: { onEntries: (entries: DeviceAppEntry[]) => void }) {
  onEntries(useDeviceAppEntries());
  return null;
}

/** useDeviceAppEntries() as the plugin store sees it (the hook needs only i18n, which falls back to en). */
function storeEntries(): DeviceAppEntry[] {
  let out: DeviceAppEntry[] = [];
  renderToStaticMarkup(createElement(Probe, { onEntries: (entries) => { out = entries; } }));
  return out;
}

describe("plugin store", () => {
  test("lists each editor plugin as optional, on every surface, opening Drive's view of its kind", () => {
    const entries = storeEntries();
    for (const want of EXPECTED) {
      const matches = entries.filter((entry) => entry.id === want.id);
      expect(matches).toHaveLength(1);
      const entry = matches[0];
      expect(entry.required).toBe(false);
      expect(entry.surfaces).toEqual(["manager", "store", "personal"]);
      expect(entry.route).toBe(driveKindHref(want.kind));
      expect(entry.category).toBe("files");
      expect(entry.color).toBe(want.color);
      expect(entry.icon).toBe(want.icon);
      expect(entry.permissionKey).toBe("dashboard");
    }
  });

  test("Drive is listed as built in; the featured row names optional plugins it lists", () => {
    const entries = storeEntries();
    const drive = entries.find((entry) => entry.id === "drive");
    expect(drive?.required).toBe(true);
    expect(drive?.route).toBe("/manager/drive");
    expect(FEATURED_PLUGINS).toContain("sheets");
    expect(FEATURED_PLUGINS).not.toContain("drive");
    for (const id of FEATURED_PLUGINS) {
      expect(entries.find((entry) => entry.id === id)?.required).toBe(false);
      expect(pluginCategory(id)).not.toBe("essentials");
    }
  });
});
