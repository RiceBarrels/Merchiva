// lib/sheets/univer/{white-label,locale-loader}.ts — Univer's copy in all seven packs the editor loads, after
// white-labelling: no product name leaks, the unrendered support links are gone, grammar-sensitive French
// elisions read right, words that merely start with "univer" survive, and our permission hint replaces
// Univer's permission errors (sheets.md §9.5, §15 locale-white-label).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ILanguagePack, LanguageValue } from "@univerjs/presets";
import { importUniverPack, loadUniverLocale, univerLocaleFor, type UniverLocaleTag } from "@/lib/sheets/univer/locale-loader";
import {
  BRAND_LEAK_RE, neutralizeFunctionExamples, viewOnlyOverrides, whiteLabelLocale, whiteLabelText,
} from "@/lib/sheets/univer/white-label";
import { UNIVER_LOCALE } from "@/lib/sheets/univer-constants";
import { brandViolation } from "../../licenses/brand";
import { loadHeadlessModules } from "./helpers/headless";

const BRAND = "Merchiva";
const HINT = "You're viewing. Select Edit to make changes.";
const TAGS: readonly UniverLocaleTag[] = ["en-US", "es-ES", "fr-FR", "ar-SA", "zh-CN", "zh-TW", "zh-HK"];
const APP_LOCALE: Readonly<Record<UniverLocaleTag, string>> = {
  "en-US": "en", "es-ES": "es", "fr-FR": "fr", "ar-SA": "ar", "zh-CN": "zh-cn", "zh-TW": "zh-tw", "zh-HK": "zh-hk",
};
/** Emoji search keywords (never displayed): the Arabic keywords for 🥽 include غوغل, "goggle", not the company. */
const EMOJI_KEYWORDS = /^ui\.emojiPicker\.emojiSearchIndex\./;

function leaves(value: LanguageValue, path = "", out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => leaves(item, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, out);
  return out;
}

function functionLinks(pack: ILanguagePack): LanguageValue[] {
  const list = ((pack["engine-formula"] as ILanguagePack | undefined)?.functionList ?? {}) as ILanguagePack;
  return Object.values(list).map((entry) => (entry as ILanguagePack).links).filter((links) => links !== undefined);
}

const valueAt = (pack: ILanguagePack, path: string): LanguageValue | undefined =>
  path.split(".").reduce<LanguageValue | undefined>((node, key) => (node && typeof node === "object" && !Array.isArray(node) ? node[key] : undefined), pack);

describe("whiteLabelLocale over the seven merged packs", () => {
  for (const tag of TAGS) {
    test(tag, async () => {
      const merged = await importUniverPack(tag);
      const before = JSON.stringify(merged);
      const out = whiteLabelLocale(merged, { brand: BRAND, overrides: viewOnlyOverrides(merged, HINT) });
      expect(JSON.stringify(merged)).toBe(before); // the input pack is not changed

      const all = leaves(out);
      expect(all.length).toBeGreaterThan(10_000);
      expect(all.filter(([, text]) => BRAND_LEAK_RE.test(text))).toEqual([]);
      // The repo-wide rule for user-facing copy (scripts/licenses/brand.ts) finds nothing either.
      expect(all.filter(([path, text]) => !EMOJI_KEYWORDS.test(path) && brandViolation(APP_LOCALE[tag], text) !== null)).toEqual([]);

      const linksBefore = functionLinks(merged);
      expect(linksBefore.length).toBeGreaterThan(100);
      expect(functionLinks(out).every((links) => Array.isArray(links) && links.length === 0)).toBe(true);

      for (const path of ["sheets-ui.permission.dialog.editErr", "sheets.permission.dialog.editErr", "sheets-ui.permission.dialog.pasteErr"]) {
        expect(valueAt(out, path)).toBe(HINT);
      }
      // Leaves that are not errors keep their text.
      expect(valueAt(out, "sheets-ui.permission.dialog.search")).toBe(whiteLabelText(String(valueAt(merged, "sheets-ui.permission.dialog.search")), BRAND));

      // Words that only start with "univer" are untouched.
      for (const [path, text] of leaves(merged)) {
        for (const word of text.match(/\b[Uu]nivers\p{L}*/gu) ?? []) expect(String(valueAt(out, path) ?? "")).toContain(word);
      }
    });
  }

  test("French elisions read as French: d’Excel → de Merchiva", async () => {
    const merged = await importUniverPack("fr-FR");
    const elided = leaves(merged).filter(([, text]) => /[dD][’']Excel\b/.test(text));
    expect(elided.length).toBeGreaterThan(0);
    const out = whiteLabelLocale(merged, { brand: BRAND });
    for (const [path] of elided) {
      const text = String(valueAt(out, path));
      expect(text).toMatch(/[dD]e Merchiva/);
      expect(text).not.toMatch(/Excel/);
    }
    expect(whiteLabelText("la fonction qu’Excel utilise", BRAND)).toBe("la fonction que Merchiva utilise");
    expect(whiteLabelText("Microsoft Office Excel 表达式", BRAND)).toBe("Merchiva 表达式");
    expect(whiteLabelText("une version actuelle de Microsoft 365", BRAND)).toBe("une version actuelle de Merchiva");
    expect(whiteLabelText("universal and universitario", BRAND)).toBe("universal and universitario");
  });

  test("overrides are deep-merged last; the loader applies them for the app locale", async () => {
    const out = whiteLabelLocale({ a: { b: "Excel", c: "keep" } }, { brand: BRAND, overrides: { a: { b: "ours" } } });
    expect(out).toEqual({ a: { b: "ours", c: "keep" } });
    const loaded = await loadUniverLocale("fr", BRAND, HINT);
    expect([loaded.type, loaded.direction, loaded.fallback]).toEqual([UNIVER_LOCALE.FR_FR, "ltr", false]);
    expect(valueAt(loaded.pack, "sheets-ui.permission.dialog.editErr")).toBe(HINT);
    expect(leaves(loaded.pack).filter(([, text]) => BRAND_LEAK_RE.test(text))).toEqual([]);
  });
});

describe("univerLocaleFor", () => {
  test("every app locale maps; Hindi falls back to English; Arabic chrome is right to left", () => {
    expect(univerLocaleFor("en")).toEqual({ type: UNIVER_LOCALE.EN_US, tag: "en-US", direction: "ltr", fallback: false });
    expect(univerLocaleFor("hi")).toEqual({ type: UNIVER_LOCALE.EN_US, tag: "en-US", direction: "ltr", fallback: true });
    expect(univerLocaleFor("ar")).toEqual({ type: UNIVER_LOCALE.AR_SA, tag: "ar-SA", direction: "rtl", fallback: false });
    expect(["es", "fr", "zh-cn", "zh-tw", "zh-hk"].map((l) => univerLocaleFor(l).tag)).toEqual(["es-ES", "fr-FR", "zh-CN", "zh-TW", "zh-HK"]);
  });
});

describe("guards on what white-labelling relies on", () => {
  test("Univer 1.0.2 never reads the function `links` it ships (so emptying them hides nothing)", () => {
    for (const name of ["sheets-formula-ui", "sheets-formula", "engine-formula"]) {
      for (const file of ["index.js", "facade.js"]) {
        const code = readFileSync(join(process.cwd(), "node_modules", "@univerjs", name, "lib", "es", file), "utf8");
        expect(code.length).toBeGreaterThan(0);
        expect(/\.links\b|\blinks\s*:|\[["']links["']\]/.test(code)).toBe(false);
      }
    }
  });

  test("neutralizeFunctionExamples leaves no univer.ai or Univer in FUNCTION_LIST examples", async () => {
    const { core } = await loadHeadlessModules();
    const examples = () => core.FUNCTION_LIST.flatMap((info) => (info.functionParameter ?? []).map((p) => String(p.example ?? "")));
    expect(examples().filter((e) => /univer/i.test(e)).length).toBeGreaterThanOrEqual(40);
    neutralizeFunctionExamples(core.FUNCTION_LIST, BRAND);
    neutralizeFunctionExamples(core.FUNCTION_LIST, "Twice"); // once per list
    expect(examples().filter((e) => /univer/i.test(e))).toEqual([]);
    const email = core.FUNCTION_LIST.find((info) => info.functionName === "ISEMAIL")?.functionParameter?.[0]?.example;
    expect(email).toBe("\"name@example.com\"");
    expect(examples()).toContain("\"Merchiva\"");
  });
});
