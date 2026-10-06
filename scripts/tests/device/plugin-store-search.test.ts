// lib/plugin-store.ts: the plugin store's search and categories. Search matches the localized name, category
// and description, ignores case and accents in every locale, needs every word, and ranks name matches first.
// Every catalog / device app id has a category, and the featured row only names optional plugins.

import { describe, expect, test } from "bun:test";
import { FEATURED_PLUGINS, PLUGIN_CATEGORIES, normalizeSearchText, pluginCategory, searchPlugins } from "@/lib/plugin-store";
import { REQUIRED_DEVICE_APPS, isRequiredDeviceApp } from "@/lib/device-apps";

const P = (id: string, name: string, description: string, categoryLabel: string) => ({ id, name, description, categoryLabel });

const EN = [
  P("drive", "Drive", "Files, photos, sheets and slides for your store in one place.", "Files & documents"),
  P("docs", "Docs", "Store manuals and documents.", "Files & documents"),
  P("sales", "Sales", "Today's sales at a glance.", "Sales & reports"),
  P("tasks", "Tasks", "Roles and their task lists; today's to-do for you and the team.", "Team"),
  P("training", "Training", "Lessons and check-offs for new staff.", "Team"),
];

const ids = (list: Array<{ id: string }>) => list.map((p) => p.id);

describe("searchPlugins", () => {
  test("an empty or blank query returns every plugin in order", () => {
    expect(ids(searchPlugins(EN, ""))).toEqual(ids(EN));
    expect(ids(searchPlugins(EN, "   "))).toEqual(ids(EN));
  });

  test("matches name, category and description, case-insensitively", () => {
    expect(ids(searchPlugins(EN, "DRIVE"))).toEqual(["drive"]);
    expect(ids(searchPlugins(EN, "team"))).toEqual(["tasks", "training"]);
    expect(ids(searchPlugins(EN, "glance"))).toEqual(["sales"]);
  });

  test("ranks a name prefix, then a name match, then category, then description", () => {
    const list = [
      P("a", "Reports hub", "x", "Other"),
      P("b", "Weekly reports", "x", "Other"),
      P("c", "Ledger", "x", "Sales & reports"),
      P("d", "Shelf", "Print reports", "Other"),
    ];
    expect(ids(searchPlugins([...list].reverse(), "reports"))).toEqual(["a", "b", "c", "d"]);
  });

  test("every word must match somewhere", () => {
    expect(ids(searchPlugins(EN, "files photos"))).toEqual(["drive"]);
    expect(ids(searchPlugins(EN, "files nothing"))).toEqual([]);
  });

  test("ignores accents and works in non-Latin locales", () => {
    const fr = [P("drive", "Drive", "Fichiers et photos.", "Fichiers et documents"), P("sales", "Ventes", "Les ventes du jour.", "Ventes et rapports")];
    expect(ids(searchPlugins(fr, "fichiers"))).toEqual(["drive"]);
    const frAccent = [P("team", "Équipe", "Formation du personnel.", "Équipe")];
    expect(ids(searchPlugins(frAccent, "equipe"))).toEqual(["team"]);
    const zh = [P("drive", "云盘", "门店的文件、照片和表格。", "文件与文档"), P("tasks", "任务", "今日待办。", "团队")];
    expect(ids(searchPlugins(zh, "文档"))).toEqual(["drive"]);
    expect(ids(searchPlugins(zh, "任务"))).toEqual(["tasks"]);
    const ar = [P("sales", "المبيعات", "مبيعات اليوم.", "المبيعات والتقارير")];
    expect(ids(searchPlugins(ar, "التقارير"))).toEqual(["sales"]);
    const hi = [P("sales", "बिक्री", "आज की बिक्री।", "बिक्री और रिपोर्ट")];
    expect(ids(searchPlugins(hi, "रिपोर्ट"))).toEqual(["sales"]);
  });

  test("folds full-width characters", () => {
    expect(normalizeSearchText("ＤＲＩＶＥ")).toBe("drive");
    expect(ids(searchPlugins(EN, "ｄｏｃｓ"))).toEqual(["docs"]);
  });
});

describe("plugin categories", () => {
  test("every required and known app id has a real category", () => {
    const known = [...REQUIRED_DEVICE_APPS, "requests", "tasks", "training", "pay", "products", "sales", "bookings", "docs", "drive", "sheets", "slides"];
    for (const id of known) expect(PLUGIN_CATEGORIES).toContain(pluginCategory(id));
  });

  test("Drive and the editor plugins share the files category", () => {
    for (const id of ["drive", "docs", "sheets", "slides"]) expect(pluginCategory(id)).toBe("files");
  });

  test("unknown ids fall back to essentials", () => {
    expect(pluginCategory("not-a-plugin")).toBe("essentials");
  });

  test("the featured row names optional plugins only", () => {
    for (const id of FEATURED_PLUGINS) expect(isRequiredDeviceApp(id)).toBe(false);
  });
});
