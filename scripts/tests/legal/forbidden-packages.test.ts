import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLockfile } from "../../licenses/lockfile";
import { FORBIDDEN_IMPORT_SPECIFIERS, FORBIDDEN_PACKAGES, MUST_BE_ABSENT } from "../../licenses/policy";
import { importSpecifiers, readSources } from "./import-graph";

/*
 * Packages that must never ship (integration-legal §3): Univer Pro and the advanced / collaboration presets,
 * HyperFormula, Handsontable, the npm `xlsx` package, the form library's commercial Creator / Analytics / PDF, and the unlicensed `buffers` / `binary` chain that the
 * unzipper override removes.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
const lock = readLockfile(ROOT);
const forbidden = (name: string) => FORBIDDEN_PACKAGES.some((re) => re.test(name));

describe("forbidden packages", () => {
  test("the patterns catch what they must and nothing else", () => {
    for (const name of ["@univerjs-pro/license", "@univerjs/preset-sheets-advanced", "@univerjs/preset-sheets-collaboration", "hyperformula", "handsontable", "@handsontable/react", "xlsx", "survey-creator-core", "survey-creator-react", "survey-creator", "surveyjs-editor", "survey-analytics", "survey-pdf"]) {
      expect(forbidden(name)).toBe(true);
    }
    for (const name of ["@univerjs/presets", "@univerjs/preset-sheets-core", "@univerjs/preset-sheets-sort", "exceljs", "xlsx-js-style", "survey-core", "survey-react-ui", "survey-creators", "surveyjs-widgets"]) {
      expect(forbidden(name)).toBe(false);
    }
  });

  test("package.json has none in dependencies, devDependencies or overrides", () => {
    const keys = ["dependencies", "devDependencies", "overrides"].flatMap((field) => Object.keys(pkg[field] ?? {}));
    expect(keys.filter(forbidden)).toEqual([]);
  });

  test("bun.lock resolves none (names parsed from the values, so aliases are caught)", () => {
    const names = [...lock.packages.values()].map((p) => p.name);
    expect(names.length).toBeGreaterThan(500);
    expect(names.filter(forbidden)).toEqual([]);
  });

  test("bun.lock text never mentions @univerjs-pro (optional peers included)", () => {
    expect(readFileSync(join(ROOT, "bun.lock"), "utf8").includes("@univerjs-pro")).toBe(false);
  });

  test("MUST_BE_ABSENT packages are not in the lockfile", () => {
    const names = new Set([...lock.packages.values()].map((p) => p.name));
    expect(MUST_BE_ABSENT.filter((n) => names.has(n))).toEqual([]);
  });

  test("no source file imports a forbidden specifier or loads SheetJS from its CDN", () => {
    const sources = readSources(ROOT, ["app", "components", "lib", "spacetimedb/src", "cli"]);
    expect(sources.size).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const [path, src] of sources) {
      for (const spec of importSpecifiers(src)) if (FORBIDDEN_IMPORT_SPECIFIERS.some((re) => re.test(spec))) hits.push(`${path}: ${spec}`);
      if (src.includes("cdn.sheetjs.com")) hits.push(`${path}: cdn.sheetjs.com`);
    }
    expect(hits).toEqual([]);
  });

  test("the specifier patterns also catch deep imports", () => {
    for (const spec of ["@univerjs-pro/sheets", "xlsx/dist/xlsx.full.min.js", "hyperformula/es", "@univerjs/preset-sheets-advanced/lib/index.css", "survey-creator-react", "survey-creator", "survey-creator/survey-creator.css", "surveyjs-editor", "survey-analytics/survey.analytics.css", "survey-pdf"]) {
      expect(FORBIDDEN_IMPORT_SPECIFIERS.some((re) => re.test(spec))).toBe(true);
    }
    for (const spec of ["@univerjs/preset-sheets-core/lib/index.css", "survey-core", "survey-core/survey-core.min.css", "survey-react-ui"]) {
      expect(FORBIDDEN_IMPORT_SPECIFIERS.some((re) => re.test(spec))).toBe(false);
    }
  });
});
