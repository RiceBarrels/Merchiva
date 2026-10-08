import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brandViolation } from "../../licenses/brand";

/*
 * No third-party marks in the Sheets, Slides and licenses copy (integration-legal §4), and "Univer" nowhere in any
 * namespace: Univer, Moveable, Selecto and Daybrush appear only as attribution inside the notices. The rule is
 * brandViolation (scripts/licenses/brand.ts), shared with the fragment validator and drive-ui's copy-branding test.
 *
 * Until the i18n merge, the new copy lives in scripts/i18n/drive/ fragments, so their leaves are checked as they
 * will ship. The fragment folder is temporary (integration-legal §6.7), so it is loaded only while it exists.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const LOCALES = ["en", "ar", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"] as const;
const PREFIXES = ["sheets", "slides", "licenses", "landing.footer.licenses"];
const underPrefix = (key: string) => PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));

function flatten(node: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof node === "string") out.set(prefix, node);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  return out;
}

/** locale → key → value: messages/*.json, overlaid by the fragment leaves while fragments exist. */
async function shippedCopy(): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  for (const locale of LOCALES) out.set(locale, flatten(JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"))));
  const fragmentModule = join(ROOT, "scripts/i18n/drive/fragment.ts");
  if (existsSync(fragmentModule)) {
    const { loadFragments, leavesOf } = (await import(fragmentModule)) as typeof import("../../i18n/drive/fragment");
    for (const frag of loadFragments()) {
      for (const locale of LOCALES) {
        const target = out.get(locale) as Map<string, string>;
        for (const [key, value] of leavesOf(frag, locale)) target.set(key, value);
      }
    }
  }
  return out;
}

describe("brandViolation", () => {
  test("ordinary words pass", () => {
    for (const value of ["numbers", "Numbers only", "keynote speaker", "Open-source licenses", "Excellent"]) expect(brandViolation("en", value)).toBeNull();
  });
  test("third-party marks and their transliterations fail", () => {
    expect(brandViolation("en", "Excel")).toBe("Excel");
    expect(brandViolation("en", "open the excel file")).toBe("excel");
    expect(brandViolation("en", "Google")).toBe("Google");
    expect(brandViolation("en", "Univer formulas")).toBe("Univer");
    expect(brandViolation("en", "Built with SurveyJS")).toBe("SurveyJS");
    expect(brandViolation("hi", "एक्सेल फ़ाइल")).toBe("एक्सेल");
    expect(brandViolation("ar", "ملف إكسل")).toBe("إكسل");
    expect(brandViolation("zh-cn", "微软表格")).toBe("微软");
  });
});

describe("shipped copy", () => {
  test("Sheets, Slides and licenses copy names no third-party product, in every locale", async () => {
    const copy = await shippedCopy();
    const hits: string[] = [];
    for (const [locale, leaves] of copy) {
      for (const [key, value] of leaves) {
        if (!underPrefix(key)) continue;
        const term = brandViolation(locale, value);
        if (term) hits.push(`${locale} ${key}: "${term}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("no value in any namespace says Univer", async () => {
    const copy = await shippedCopy();
    const hits = [...copy].flatMap(([locale, leaves]) => [...leaves].filter(([, v]) => /\bUniver\b/i.test(v)).map(([k]) => `${locale} ${k}`));
    expect(hits).toEqual([]);
  });

  test("the licenses copy exists in every locale", async () => {
    const copy = await shippedCopy();
    for (const locale of LOCALES) {
      expect(copy.get(locale)?.get("licenses.title")).toBeTruthy();
      expect(copy.get(locale)?.get("landing.footer.licenses")).toBeTruthy();
    }
  });
});
