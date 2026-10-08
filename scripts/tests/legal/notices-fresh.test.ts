import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { collectNotices, findInstalledCopy, renderNoticesText } from "../../licenses/collect";
import { inSkippedFolder } from "../../licenses/package-files";
import { ELECTIONS, EXCEPTIONS } from "../../licenses/policy";
import { mitText } from "../../licenses/spdx-texts";
import { BUNDLES, UPSTREAM } from "../../licenses/upstream";
import { importSpecifiers, readSources } from "./import-graph";

/*
 * public/legal/* is what users read at /licenses and in every in-app licenses panel. It must match what the
 * generator produces from the current lockfile, or a dependency change shipped without its notices.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const { file } = collectNotices(ROOT);
const find = (name: string, source = "npm") => file.packages.filter((e) => e.name === name && e.source === source);

describe("notices are fresh", () => {
  test("public/legal/third-party-notices.json equals the generator output (run `bun scripts/licenses/generate.ts`)", () => {
    const committed: unknown = JSON.parse(readFileSync(join(ROOT, "public/legal/third-party-notices.json"), "utf8"));
    expect(committed).toEqual(file);
  });

  test("public/legal/THIRD_PARTY_NOTICES.txt equals the generator output (run `bun scripts/licenses/generate.ts`)", () => {
    expect(readFileSync(join(ROOT, "public/legal/THIRD_PARTY_NOTICES.txt"), "utf8")).toBe(renderNoticesText(file));
  });

  test("every text id an entry names exists", () => {
    const missing = file.packages.flatMap((e) => e.textIds.filter((id) => !(id in file.texts)).map((id) => `${e.name}: ${id}`));
    expect(missing).toEqual([]);
    expect(file.packages.filter((e) => e.textIds.length === 0).map((e) => e.name)).toEqual([]);
  });
});

describe("notices content", () => {
  test("the office and Drive dependencies are listed", () => {
    for (const name of ["@univerjs/core", "exceljs", "pptxtojson", "pptxgenjs", "react-moveable", "react-selecto", "@vercel/blob", "rxjs"]) {
      expect(find(name).length).toBeGreaterThan(0);
    }
  });

  test("Univer packages carry the DreamNum attribution", () => {
    expect(find("@univerjs/core")[0]?.copyright).toContain("Copyright 2023-present DreamNum Co., Ltd.");
  });

  test("the inlined jszip is used under MIT, with the election note", () => {
    const inlined = find("jszip", "inlined");
    expect(inlined.map((e) => e.via).sort()).toEqual(["exceljs@4.4.0", "pptxtojson@2.2.0"]);
    for (const e of inlined) {
      expect(e.elected).toBe("MIT");
      expect(e.note).toContain(ELECTIONS.jszip.note);
    }
  });

  test("upstream attributions of inlined code are listed", () => {
    const inlined = file.packages.filter((e) => e.source === "inlined");
    const names = new Set(inlined.map((e) => e.name));
    for (const name of ["PPTXjs", "PPTX2HTML", "officegen", "bytes", "tailwind-merge", "tslib"]) expect(names.has(name)).toBe(true);
    expect(inlined.filter((e) => e.via === "exceljs@4.4.0").length).toBe(66);
    expect(inlined.filter((e) => e.via === "pptxtojson@2.2.0").length).toBe(22);
  });

  test("the ports and data Univer relabels as its own are listed (re-check them on a Univer upgrade)", () => {
    const via = (host: string) => file.packages.filter((e) => e.source === "inlined" && e.via === host).map((e) => `${e.name} (${e.license})`).sort();
    expect(via("@univerjs/engine-render@1.0.2")).toEqual([
      "Unicode Character Database (Unicode-3.0)",
      "hyph-en-us (FSFAP-no-warranty-disclaimer)",
      "hyphen (ISC)",
      "linebreak (MIT)",
      "tiny-inflate (MIT)",
      "unicode-trie (MIT)",
    ]);
    expect(via("@univerjs/core@1.0.2")).toEqual(["numfmt (MIT)"]);
    expect(via("@univerjs/ui@1.0.2")).toEqual(["Unicode CLDR (Unicode-3.0)"]);
    const [cldr] = find("Unicode CLDR", "inlined");
    expect(cldr?.copyright).toEqual(["Copyright © 1991-2026 Unicode, Inc."]);
    expect(file.texts[cldr?.textIds[0] ?? ""]).toStartWith("UNICODE LICENSE V3");
    expect(find("hyph-en-us", "inlined")[0]?.copyright).toEqual(["Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken"]);
    expect(find("hyphen", "inlined")[0]?.note).toContain("Only the American English patterns ship");
  });

  test("BUNDLES reads the ExcelJS build the app imports (the bare one)", () => {
    const imported = new Set<string>();
    for (const [, src] of readSources(ROOT, ["app", "components", "lib"])) {
      // A value import of the package root would ship its "browser" build (dist/exceljs.min.js) instead.
      for (const spec of importSpecifiers(src)) if (spec === "exceljs" || spec.startsWith("exceljs/")) imported.add(spec.slice("exceljs/".length));
    }
    expect([...imported]).toEqual(["dist/exceljs.bare.min.js"]);
    const bundled = BUNDLES.filter((b) => b.host === "exceljs").map((b) => b.file);
    expect(bundled).toEqual([...imported]);
  });

  test("every Next-vendored package is listed", () => {
    expect(file.packages.filter((e) => e.source === "vendored").length).toBe(23);
  });

  test("spacetimedb is listed as the documented BUSL-1.1 exception", () => {
    const [e] = find("spacetimedb");
    expect(e?.license).toBe("BUSL-1.1");
    expect(e?.note).toContain(EXCEPTIONS.spacetimedb.reason);
    expect(file.texts[e?.textIds[0] ?? ""]).toContain("Business Source License 1.1");
  });

  test("no text comes from a test fixture (the inlined util is the upstream one)", () => {
    const util = findInstalledCopy(ROOT, "util");
    expect(util === null || !inSkippedFolder(ROOT, util)).toBe(true);
    const [inlined] = file.packages.filter((e) => e.name === "util" && e.via === "exceljs@4.4.0");
    expect(file.texts[inlined?.textIds[0] ?? ""]).toBe(mitText(UPSTREAM.util.copyright));
  });
});

describe("the /licenses route ships in every build", () => {
  test("app/licenses/page.tsx exists, as a root route", () => {
    expect(existsSync(join(ROOT, "app/licenses/page.tsx"))).toBe(true);
  });

  test("no dynamic segment holds a licenses route (a [locale] page becomes the open-in-browser fallback)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${entry}`;
        if (!statSync(join(ROOT, rel)).isDirectory()) continue;
        if (entry === "licenses" && /\/\[[^/]+\]\//.test(`/${dir}/`)) hits.push(rel);
        walk(rel);
      }
    };
    walk("app");
    expect(hits).toEqual([]);
  });

  test("ignoreInStatic.json does not exclude it", () => {
    const { ignore } = JSON.parse(readFileSync(join(ROOT, "ignoreInStatic.json"), "utf8")) as { ignore: string[] };
    const pattern = (glob: string) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}(/|$)`);
    for (const path of ["app/licenses", "app/licenses/page.tsx"]) {
      expect(ignore.filter((g) => pattern(g).test(path))).toEqual([]);
    }
  });
});
