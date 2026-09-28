// Every static i18n key the docs home and its dialogs render, inside the WP-6 namespaces,
// exists in all 8 locale files (after `bun scripts/i18n/docs-home.ts`).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const LOCALES = ["en", "zh-cn", "zh-tw", "zh-hk", "fr", "es", "hi", "ar"] as const;
const OWNED = [
  "docs.title",
  "docs.untitled",
  "docs.homeTooltip",
  "docs.home",
  "docs.menu",
  "docs.rename",
  "docs.trash",
  "docs.deleteForever",
  "docs.copy",
  "docs.open",
  "docs.share",
];

const SOURCES = [
  ...readdirSync(join(ROOT, "components/docs/home")).map((f) => join("components/docs/home", f)),
  "components/docs/dialogs/share-dialog.tsx",
  "components/docs/dialogs/make-private-dialog.tsx",
  "components/docs/dialogs/open-document-dialog.tsx",
  "components/docs/dialogs/rename-dialog.tsx",
  "components/docs/dialogs/delete-forever-dialog.tsx",
  "app/manager/docs/page.tsx",
];

/** Keys built from template literals in the sources. */
const DYNAMIC_KEYS = [
  ...["today", "week", "month", "earlier"].map((g) => `docs.home.group.${g}`),
  ...["anyone", "me", "notMe"].map((o) => `docs.home.owner.${o}`),
  ...["modified", "opened", "created", "title"].map((s) => `docs.home.sort.${s}`),
  ...["modified", "opened", "created", "trashed"].map((k) => `docs.home.meta.${k}`),
  ...["modified", "opened", "created"].map((k) => `docs.home.col.${k}`),
];

function staticKeys(): string[] {
  const keys = new Set<string>();
  const re = /["'`](docs\.[A-Za-z0-9_.]+[A-Za-z0-9_])["'`]/g;
  for (const file of SOURCES) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const match of text.matchAll(re)) keys.add(match[1]);
  }
  return [...keys];
}

function lookup(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);
}

describe("docs home i18n", () => {
  const owned = [...staticKeys(), ...DYNAMIC_KEYS].filter((key) => OWNED.some((o) => key === o || key.startsWith(`${o}.`)));

  test("sources reference owned keys", () => {
    expect(owned.length).toBeGreaterThan(100);
  });

  for (const locale of LOCALES) {
    test(`${locale} has every owned key as a non-empty string`, () => {
      const messages = JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as unknown;
      const missing = owned.filter((key) => {
        const value = lookup(messages, key);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }

  test("placeholders survive translation", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "messages", "en.json"), "utf8")) as unknown;
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as unknown;
      for (const key of owned) {
        const enVars = String(lookup(en, key)).match(/\{\w+\}/g)?.sort() ?? [];
        const vars = String(lookup(messages, key)).match(/\{\w+\}/g)?.sort() ?? [];
        expect({ locale, key, vars }).toEqual({ locale, key, vars: enVars });
      }
    }
  });
});
