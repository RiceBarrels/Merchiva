import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Two properties the app depends on and nothing else enforced:
 *
 *   1. every locale holds exactly the keys en does. A key missing from a
 *      translation falls back to English, which is survivable; a key missing
 *      from en is not, because lookup() then renders the raw path — the user
 *      sees "device.lite.notifications.empty" on screen.
 *   2. every t("…") in the source resolves. This is what actually catches a
 *      new screen shipped with keys nobody added.
 */

const LOCALES = ["en", "ar", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"] as const;
const ROOT = join(import.meta.dir, "../../..");

type Json = { [k: string]: Json | string };

function flatten(obj: Json, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Json, key, out);
    else out.set(key, String(v));
  }
  return out;
}

function loadLocale(locale: string): Map<string, string> {
  return flatten(JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as Json);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "generated") continue;
      sourceFiles(rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !/ 2\./.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const en = loadLocale("en");

describe("locale parity", () => {
  for (const locale of LOCALES) {
    if (locale === "en") continue;

    test(`${locale} holds exactly the keys en does`, () => {
      const other = loadLocale(locale);
      const missing = [...en.keys()].filter((k) => !other.has(k));
      const extra = [...other.keys()].filter((k) => !en.has(k));
      expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
    });

    test(`${locale} keeps every {placeholder} en uses`, () => {
      const other = loadLocale(locale);
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      const mismatched = [...en]
        .filter(([k, v]) => other.has(k) && names(v) !== names(other.get(k)!))
        .map(([k]) => k);
      expect(mismatched).toEqual([]);
    });
  }
});

describe("t() call sites", () => {
  test("every literal key resolves in en", () => {
    const files = ["app", "components", "lib"].flatMap((d) => sourceFiles(d));
    const unresolved = new Set<string>();
    for (const file of files) {
      // The only literal t("…") that is documentation, not a call.
      if (file.endsWith(join("browser-shell", "context-menu.ts"))) continue;
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z][\w.-]*)"\s*\)/g)) {
        if (!en.has(m[1])) unresolved.add(`${m[1]} (${file})`);
      }
    }
    expect([...unresolved]).toEqual([]);
  });
});
