// Device catalog copy in every locale. Names and descriptions are read through template keys
// (`device.catalog.${id}`, `device.catalogDesc.${id}`), which scripts/tests/i18n/keys.test.ts cannot see, so a
// missing one would show the raw key on the grids and in the plugin store. Copy counts once it is in messages/*.json
// or in a Drive fragment under scripts/i18n/drive (merged by `bun scripts/i18n/drive.ts`), like
// scripts/tests/drive/home/fixture.ts reads it.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_CATALOG } from "@/components/device/app-catalog";
import { useDeviceAppEntries } from "@/components/device/apps/app-store";
import { LOCALES, MESSAGES_DIR, flattenMessages, leavesOf, loadFragments } from "@/scripts/i18n/drive/fragment";

/** Every locale's copy: messages/<locale>.json overlaid with every Drive fragment's leaves for that locale. */
function copyByLocale(): Map<string, Map<string, string>> {
  const fragments = loadFragments();
  const out = new Map<string, Map<string, string>>();
  for (const locale of LOCALES) {
    const known = flattenMessages(JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")));
    for (const fragment of fragments) for (const [key, value] of leavesOf(fragment, locale)) known.set(key, value);
    out.set(locale, known);
  }
  return out;
}

function Probe({ onEntries }: { onEntries: (ids: string[]) => void }) {
  onEntries(useDeviceAppEntries().map((entry) => entry.id));
  return null;
}

/** Ids the plugin store lists (each shows `device.catalogDesc.<id>`). */
function storeIds(): string[] {
  let ids: string[] = [];
  renderToStaticMarkup(createElement(Probe, { onEntries: (seen) => { ids = seen; } }));
  return ids;
}

function missing(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const [locale, known] of copyByLocale()) for (const key of keys) if (!known.get(key)?.trim()) out.push(`${locale}:${key}`);
  return out;
}

describe("device catalog copy", () => {
  test("every catalog app has a name in all 8 locales", () => {
    expect(missing(APP_CATALOG.map((app) => `device.catalog.${app.id}`))).toEqual([]);
  });

  test("every plugin the store lists has a description in all 8 locales", () => {
    const ids = storeIds();
    // The editor plugins are listed although they have no tile.
    expect(ids).toEqual(expect.arrayContaining(["docs", "drive", "sheets", "slides"]));
    expect(missing(ids.map((id) => `device.catalogDesc.${id}`))).toEqual([]);
  });
});
