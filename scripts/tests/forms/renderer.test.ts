// components/forms/renderer + responses (MANAGER-2): the renderer's runtime strings, the vendor-import boundary,
// and that every forms.* key these screens use has an English draft.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  runtimeKey, runtimeStrings, setupSurveyLocale, SURVEY_RUNTIME_STRINGS, type SurveyLocalizationLike,
} from "@/components/forms/renderer/survey-locale";
import { SURVEY_ADAPTER_KEYS } from "@/lib/forms/survey-adapter";
import { FORM_EXPORT_KEYS } from "@/lib/forms/export";

const ROOT = join(import.meta.dir, "..", "..", "..");
const DRAFT = JSON.parse(readFileSync(join(ROOT, "scripts/i18n/drive/forms/en.json"), "utf8"));
const OWNED_DIRS = ["components/forms/renderer", "components/forms/responses", "app/manager/forms/fill"];

function has(dict: unknown, key: string): boolean {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node.trim() !== "";
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules" && !name.startsWith(".")) out.push(...files(full));
    } else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

function fakeLocalization(): SurveyLocalizationLike & { locales: Record<string, Record<string, unknown>>; dirs: Record<string, boolean | undefined> } {
  const locales: Record<string, Record<string, unknown>> = { en: { pageNextText: "Next", matrix_row: "Row" } };
  const dirs: Record<string, boolean | undefined> = {};
  return {
    locales,
    dirs,
    getLocaleStrings: (loc) => locales[loc],
    setupLocale: (c) => { locales[c.localeCode] = c.strings as Record<string, unknown>; dirs[c.localeCode] = c.rtl; },
  };
}

describe("survey-locale", () => {
  test("runtimeStrings never hands the renderer a raw key path", () => {
    const strings = runtimeStrings((key) => (key === runtimeKey("pageNextText") ? "Weiter" : key));
    expect(strings).toEqual({ pageNextText: "Weiter" });
  });

  test("setupSurveyLocale keeps the built-in English underneath and marks ar right-to-left", () => {
    const loc = fakeLocalization();
    setupSurveyLocale(loc, "en", (key) => (key === runtimeKey("pageNextText") ? "Continue" : key));
    expect(loc.locales.en.pageNextText).toBe("Continue");
    expect(loc.locales.en.matrix_row).toBe("Row");
    setupSurveyLocale(loc, "ar", (key) => (key === runtimeKey("completeText") ? "إرسال" : key));
    expect(loc.locales.ar.completeText).toBe("إرسال");
    expect(loc.locales.ar.matrix_row).toBe("Row");
    expect(loc.dirs.ar).toBe(true);
    expect(loc.dirs.en).toBe(false);
  });
});

describe("i18n drafts", () => {
  test("every renderer string, adapter key and export key has an English draft", () => {
    const keys = [...SURVEY_RUNTIME_STRINGS.map(runtimeKey), ...SURVEY_ADAPTER_KEYS, ...FORM_EXPORT_KEYS];
    expect(keys.filter((k) => !has(DRAFT, k))).toEqual([]);
  });

  test("every literal forms.* key in the owned screens has a draft (here or in the data unit's)", () => {
    const data = JSON.parse(readFileSync(join(ROOT, "scripts/i18n/drive/forms/en.json"), "utf8"));
    const used = new Set<string>();
    for (const dir of OWNED_DIRS) {
      for (const file of files(join(ROOT, dir))) {
        for (const m of readFileSync(file, "utf8").matchAll(/["`](forms\.[A-Za-z_]+(?:\.[A-Za-z_]+)+)["`]/g)) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((k) => !has(DRAFT, k) && !has(data, k))).toEqual([]);
  });
});

describe("vendor boundary", () => {
  const sources = ["app", "components", "lib"].flatMap((d) => files(join(ROOT, d)));

  test("only survey-host.tsx imports the renderer packages and their stylesheets", () => {
    const importers = sources
      .filter((f) => /from\s+["']survey-(core|react-ui)|import\s+["']survey-(core|react-ui)/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(importers).toEqual(["components/forms/renderer/survey-host.tsx"]);
  });

  test("the host is reached only through next/dynamic with ssr: false", () => {
    const lazy = readFileSync(join(ROOT, "components/forms/renderer/lazy-host.tsx"), "utf8");
    expect(lazy).toMatch(/dynamic<SurveyHostProps>\(\s*\(\) => import\("\.\/survey-host"\)/);
    expect(lazy).toContain("ssr: false");
    const valueImporters = sources
      .filter((f) => /import\s+(?!type\b)[^;]*from\s+["'][^"']*renderer\/survey-host["']/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(valueImporters).toEqual([]);
  });

  test("no markdown hook, no delimiter change, no device surface touches the host", () => {
    const host = readFileSync(join(ROOT, "components/forms/renderer/survey-host.tsx"), "utf8").replace(/\/\/.*$/gm, "");
    expect(host).not.toMatch(/onTextMarkdown\.add|expressionVariableDelimiters\s*=/);
    expect(host).toContain("survey-core/survey-core.min.css");
    expect(host).toContain("survey-core/themes/adapters/shadcn-base-nova.min.css");
    for (const f of files(join(ROOT, "components/device"))) {
      expect(readFileSync(f, "utf8")).not.toMatch(/renderer\/(survey-host|lazy-host|form-preview|fallback-form)/);
    }
  });

  test("responses never use the unsafe lib/export.ts CSV helper", () => {
    for (const f of files(join(ROOT, "components/forms/responses"))) {
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/@\/lib\/export["']|downloadCSV/);
    }
  });
});
