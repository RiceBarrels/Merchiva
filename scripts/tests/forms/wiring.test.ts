// Forms on the three surfaces (design B.6): the device catalog entry that puts the lite app on /store and
// /personal, its icon, the manager route it owns (installing the plugin turns /manager/forms on), and its plugin
// store category. The lite app itself is covered by lite.test.ts.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_CATALOG, catalogApp, catalogAppForRoute, catalogAppOnSurface } from "@/components/device/app-catalog";
import { APP_ICONS, FormsIcon } from "@/components/device/app-icons";
import {
  MANAGER_ROUTE_APPS, REQUIRED_DEVICE_APPS, appForManagerRoute, isDeviceAppInstalled, isManagerRouteEnabled, isRequiredDeviceApp,
} from "@/lib/device-apps";
import { pluginCategory } from "@/lib/plugin-store";

const ROOT = join(import.meta.dir, "..", "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

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

describe("device catalog", () => {
  test("Forms is one catalog app on both device surfaces, gated by dashboard, teal", () => {
    const forms = catalogApp("forms");
    expect(forms).not.toBeNull();
    if (!forms) return;
    expect(APP_CATALOG.filter((app) => app.id === "forms")).toHaveLength(1);
    expect(forms.icon).toBe(FormsIcon);
    expect(forms.route).toBe("/manager/forms");
    expect(forms.color).toBe("teal");
    expect(forms.permissionKey).toBe("dashboard");
    expect(forms.surfaces).toEqual(["store", "personal"]);
    // Builders are owners and managers by role, but filling is for everyone: never hidden by role.
    expect(forms.managerOnly).toBeUndefined();
    expect(forms.keepManagerPage).toBeUndefined();
    expect(forms.editor).toBeUndefined();
    expect(forms.lite).toBeDefined();
    expect(forms.component).toBeDefined();
    expect(catalogAppOnSurface(forms, "store")).toBe(true);
    expect(catalogAppOnSurface(forms, "personal")).toBe(true);
  });

  test("the lazy loaders open the manager page and the FormsLite panel", () => {
    const entry = catalogEntrySource("forms");
    expect(entry).toContain(`component: lazy(() => import("@/app/manager/forms/page"))`);
    expect(entry).toContain(`lite: lite(() => import("./apps/forms").then((m) => m.FormsLite))`);
    expect(existsSync(join(ROOT, "app/manager/forms/page.tsx"))).toBe(true);
    expect(source("components/device/apps/forms.tsx")).toMatch(/export function FormsLite\(\{[^}]*\}: LiteAppProps\)/);
  });

  test("the icon is registered under the app id", () => {
    expect(APP_ICONS.forms).toBe(FormsIcon);
  });

  test("manager links under /manager/forms resolve to the app", () => {
    for (const url of ["/manager/forms", "/manager/forms/", "/manager/forms/edit?id=1&view=build"]) {
      expect(catalogAppForRoute(url)?.id).toBe("forms");
    }
    expect(catalogAppForRoute("/manager/formsx")).toBeNull();
  });
});

describe("plugin wiring", () => {
  test("installing Forms turns /manager/forms and its subpages on; it is optional", () => {
    expect(MANAGER_ROUTE_APPS["/manager/forms"]).toBe("forms");
    expect(appForManagerRoute("/manager/forms/edit?id=1")).toBe("forms");
    expect(isRequiredDeviceApp("forms")).toBe(false);
    expect((REQUIRED_DEVICE_APPS as readonly string[]).includes("forms")).toBe(false);
    expect(isDeviceAppInstalled("forms", [])).toBe(false);
    expect(isManagerRouteEnabled("/manager/forms", [])).toBe(false);
    expect(isManagerRouteEnabled("/manager/forms/edit", ["forms"])).toBe(true);
  });

  test("the plugin store files Forms under operations", () => {
    expect(pluginCategory("forms")).toBe("operations");
  });

  test("the device app never loads the manager's form library", () => {
    for (const path of ["components/device/apps/forms.tsx", "components/device/apps/forms-fill.tsx"]) {
      const text = source(path);
      expect(text).not.toMatch(/survey-core|survey-react-ui|survey-adapter|survey-json/);
      expect(text).not.toMatch(/@\/app\/manager\//);
    }
  });
});
