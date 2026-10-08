// The shared plugin install prompt (components/plugins): who may download a plugin where (pluginCanInstall), the
// prompt's tile colours against the catalog they mirror, and that every key the prompt shows exists in every locale.
// The hook, the prompt screens, PermissionGuard and createDriveDocFromTemplate replace modules with mock.module, which
// would leak into other test files sharing this process, so they run in child processes (prompt.isolated.tsx,
// template-create.isolated.ts).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_CATALOG } from "@/components/device/app-catalog";
import { PLUGIN_TILE_COLORS, pluginTileColor } from "@/components/plugins/plugin-tile";
import { pluginCanInstall } from "@/components/plugins/use-plugin-install";
import { MANAGER_ROUTE_APPS, isRequiredDeviceApp } from "@/lib/device-apps";
import type { Permissions } from "@/lib/types";
import { LOCALES, MESSAGES_DIR, flattenMessages, leavesOf, loadFragments } from "@/scripts/i18n/drive/fragment";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SETTINGS_EDIT = { settings: { view: true, edit: true } } as unknown as Permissions;
const SETTINGS_VIEW = { settings: { view: true, edit: false } } as unknown as Permissions;
const NONE = {} as Permissions;

describe("pluginCanInstall", () => {
  test("/manager and /personal: owners, managers and settings edit, like the plugin store", () => {
    for (const surface of ["manager", "personal"] as const) {
      expect(pluginCanInstall({ surface, role: "owner", permissions: NONE })).toBe(true);
      expect(pluginCanInstall({ surface, role: "manager", permissions: NONE })).toBe(true);
      expect(pluginCanInstall({ surface, role: "staff", permissions: SETTINGS_EDIT })).toBe(true);
      expect(pluginCanInstall({ surface, role: "staff", permissions: SETTINGS_VIEW })).toBe(false);
      expect(pluginCanInstall({ surface, role: "staff", permissions: null })).toBe(false);
      expect(pluginCanInstall({ surface, role: null, permissions: undefined })).toBe(false);
      // The tablet account only matters on /store.
      expect(pluginCanInstall({ surface, role: "owner", permissions: NONE, tabletRole: "staff" })).toBe(true);
    }
  });

  test("/store: the operator may manage plugins AND the tablet account (the reducer's sender) is an owner, a manager or holds settings edit", () => {
    expect(pluginCanInstall({ surface: "store", role: "owner", permissions: NONE, tabletRole: "owner" })).toBe(true);
    expect(pluginCanInstall({ surface: "store", role: "manager", permissions: NONE, tabletRole: "manager" })).toBe(true);
    expect(pluginCanInstall({ surface: "store", role: "staff", permissions: SETTINGS_EDIT, tabletRole: "owner" })).toBe(true);
    // A staff operator never installs through a manager's tablet.
    expect(pluginCanInstall({ surface: "store", role: "staff", permissions: SETTINGS_VIEW, tabletRole: "owner" })).toBe(false);
    // A manager operator on a staff tablet: the reducer would refuse the tablet account.
    expect(pluginCanInstall({ surface: "store", role: "manager", permissions: NONE, tabletRole: "staff" })).toBe(false);
    // A staff tablet account with settings edit passes the reducer (`!isManager && !perms.settings?.edit`).
    expect(pluginCanInstall({ surface: "store", role: "manager", permissions: NONE, tabletRole: "staff", tabletSettingsEdit: true })).toBe(true);
    expect(pluginCanInstall({ surface: "store", role: "owner", permissions: NONE, tabletRole: null, tabletSettingsEdit: true })).toBe(false);
    expect(pluginCanInstall({ surface: "store", role: "owner", permissions: NONE, tabletRole: null })).toBe(false);
    expect(pluginCanInstall({ surface: "store", role: "owner", permissions: NONE })).toBe(false);
  });
});

describe("plugin tile colours", () => {
  test("every optional catalog app has its catalog colour", () => {
    for (const app of APP_CATALOG) {
      if (isRequiredDeviceApp(app.id)) continue;
      expect([app.id, PLUGIN_TILE_COLORS[app.id]]).toEqual([app.id, app.color]);
    }
  });

  test("every plugin that owns a manager route has a colour; unknown ids fall back to slate", () => {
    for (const appId of new Set(Object.values(MANAGER_ROUTE_APPS))) {
      if (isRequiredDeviceApp(appId)) continue;
      expect([appId, PLUGIN_TILE_COLORS[appId] !== undefined]).toEqual([appId, true]);
    }
    expect(pluginTileColor("docs")).toBe("amber");
    expect(pluginTileColor("sheets")).toBe("lime");
    expect(pluginTileColor("slides")).toBe("fuchsia");
    expect(pluginTileColor("no-such-plugin")).toBe("slate");
  });
});

// The prompt's copy (merged messages plus the Drive fragments still waiting to merge).
const PROMPT_KEYS = [
  "pluginInstall.missingTitle", "pluginInstall.openBody", "pluginInstall.createBody", "pluginInstall.pageBody",
  "pluginInstall.askManager", "pluginInstall.download", "pluginInstall.downloading", "pluginInstall.installed",
  "pluginInstall.failed", "pluginInstall.openPlugins", "pluginInstall.notNow", "pluginInstall.offline", "common.close",
  "pluginInstall.askOtherDevice", "pluginInstall.downloadFirst", "pluginInstall.notInstalled",
];
const WITH_APP = new Set([
  "pluginInstall.missingTitle", "pluginInstall.openBody", "pluginInstall.createBody", "pluginInstall.pageBody",
  "pluginInstall.askManager", "pluginInstall.askOtherDevice", "pluginInstall.installed", "pluginInstall.failed",
]);

test("every key the prompt shows exists in all 8 locales, with {app} where the plugin is named", () => {
  const fragments = loadFragments();
  for (const locale of LOCALES) {
    const leaves = flattenMessages(JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")));
    for (const fragment of fragments) for (const [key, value] of leavesOf(fragment, locale)) leaves.set(key, value);
    for (const key of PROMPT_KEYS) {
      const value = leaves.get(key);
      expect([locale, key, typeof value === "string" && value.trim() !== ""]).toEqual([locale, key, true]);
      if (WITH_APP.has(key)) expect([locale, key, String(value).includes("{app}")]).toEqual([locale, key, true]);
    }
  }
});

function run(fixture: string): { exitCode: number | null; output: string } {
  const proc = Bun.spawnSync([process.execPath, "test", fixture], { cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function expectGreen({ exitCode, output }: { exitCode: number | null; output: string }): void {
  if (exitCode !== 0) console.error(output);
  expect(exitCode).toBe(0);
  expect(output).toMatch(/\b[1-9]\d* pass\b/);
  expect(output).toContain(" 0 fail");
}

test("usePluginInstall, the prompt screens and PermissionGuard (isolated fixture)", () => {
  expectGreen(run("./scripts/tests/plugins/prompt.isolated.tsx"));
}, 60_000);

test("createDriveDocFromTemplate (isolated fixture)", () => {
  expectGreen(run("./scripts/tests/plugins/template-create.isolated.ts"));
}, 60_000);
