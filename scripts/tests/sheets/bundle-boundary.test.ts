// Import policy of the spreadsheet editor (sheets.md §8 "Import policy", §13): what may load Univer and ExcelJS, and
// where. Read from the source with the TypeScript parser, so `import type` / `typeof import()` count as types and a
// comment never counts as an import.
//
//   · runtime @univerjs imports only in lib/sheets/univer/** and components/sheets/editor/univer-host.tsx;
//   · @univerjs specifiers only through the presets (main, /locales/<tag>, core+filter /worker, and the preset CSS
//     in the host); @univerjs/engine-formula only in the formula worker, only while package.json pins it at 1.0.2;
//   · the formula worker's module graph loads no preset main entry and no React;
//   · exceljs only as the bare build, only in the xlsx worker and its client; types only under lib/sheets/xlsx;
//   · no DOM globals in lib/sheets/xlsx/** except client.ts; lib/sheets/sync/** loads no React, Univer or Yjs;
//   · components/sheets/** never reaches the connection (subscriptions live in lib/, writes in the actions);
//   · the route (page + SheetEditorRoute) reaches neither Univer nor ExcelJS: the editor is a dynamic import.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HOST_FILE = "components/sheets/editor/univer-host.tsx";
const FORMULA_WORKER = "lib/sheets/univer/formula.worker.ts";
const XLSX_EXCEL_FILES = new Set(["lib/sheets/xlsx/xlsx.worker.ts", "lib/sheets/xlsx/client.ts"]);
const EXCEL_BARE = "exceljs/dist/exceljs.bare.min.js";
const ROUTE_FILES = ["app/manager/drive/sheet/page.tsx", "components/sheets/sheet-editor-route.tsx"];
const PRESET_NAMES = new Set(["core", "filter", "sort", "conditional-formatting", "data-validation", "find-replace", "hyper-link", "note", "drawing"]);
/**
 * Tests that already reach a transitive Univer package directly (not a shipped file). They break §8's "no other
 * specifier anywhere in scripts/" and are reported to their owners; listed so no new one slips in unnoticed.
 */
const SCRIPT_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  "scripts/tests/sheets/sanitize.test.ts": ["@univerjs/core"],
  "scripts/tests/sheets/hyperlinks.test.ts": ["@univerjs/engine-formula"],
};

type ImportKind = "static" | "side-effect" | "dynamic" | "type";
interface ImportRef {
  spec: string;
  typeOnly: boolean;
  kind: ImportKind;
}
interface SourceInfo {
  imports: ImportRef[];
  sf: ts.SourceFile;
  text: string;
}

const cache = new Map<string, SourceInfo>();

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "generated" || / 2(\.|$)/.test(entry.name)) continue;
    const rel = toPosix(join(dir, entry.name));
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function namedTypeOnly(bindings: ts.NamedImportBindings | ts.NamedExportBindings | undefined): boolean {
  return !!bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) && bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly);
}

function info(file: string): SourceInfo {
  const hit = cache.get(file);
  if (hit) return hit;
  const text = readFileSync(join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = !!clause && (clause.isTypeOnly || (!clause.name && namedTypeOnly(clause.namedBindings)));
      imports.push({ spec: node.moduleSpecifier.text, typeOnly, kind: clause ? "static" : "side-effect" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly || namedTypeOnly(node.exportClause), kind: "static" });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) imports.push({ spec: arg.text, typeOnly: false, kind: "dynamic" });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      imports.push({ spec: node.argument.literal.text, typeOnly: true, kind: "type" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const result = { imports, sf, text };
  cache.set(file, result);
  return result;
}

function isUniver(spec: string): boolean {
  return spec.startsWith("@univerjs/");
}

const enginePinned = (() => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  return pkg.dependencies?.["@univerjs/engine-formula"] === "1.0.2";
})();

/** The §8 specifier allow-list for a file. */
function allowedUniverSpec(spec: string, file: string): boolean {
  if (spec === "@univerjs/presets") return true;
  if (spec === "@univerjs/engine-formula") return file === FORMULA_WORKER && enginePinned;
  const match = /^@univerjs\/preset-sheets-([a-z-]+)(\/.*)?$/.exec(spec);
  if (!match || !PRESET_NAMES.has(match[1])) return false;
  const sub = match[2] ?? "";
  if (sub === "") return true;
  if (/^\/locales\/[a-z]{2}-[A-Z]{2}$/.test(sub)) return true;
  if (sub === "/worker") return match[1] === "core" || match[1] === "filter";
  if (sub === "/lib/index.css") return file === HOST_FILE;
  return false;
}

function mayImportUniverAtRuntime(file: string): boolean {
  return file.startsWith("lib/sheets/univer/") || file === HOST_FILE;
}

/** A repo file for a specifier (`@/…` or relative), or null (a package, CSS, or anything outside the repo). */
function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = toPosix(join(dirname(from), spec));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const abs = join(ROOT, candidate);
    if (/\.tsx?$/.test(candidate) && existsSync(abs) && statSync(abs).isFile()) return toPosix(candidate);
  }
  return null;
}

/** Every repo file `entry` loads at runtime through static imports (type-only and dynamic imports not followed). */
function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    for (const ref of info(file).imports) {
      if (ref.typeOnly || ref.kind === "dynamic" || ref.kind === "type") continue;
      const next = resolveLocal(file, ref.spec);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function runtimeRefs(file: string): ImportRef[] {
  return info(file).imports.filter((ref) => !ref.typeOnly && ref.kind !== "type");
}

const SHIPPED = ["app", "components", "lib"].flatMap((dir) => sourceFiles(dir));
const SCRIPTS = sourceFiles("scripts");

describe("Univer specifiers (sheets.md §8)", () => {
  test("the source tree is where this test thinks it is", () => {
    expect(SHIPPED).toContain(HOST_FILE);
    expect(SHIPPED).toContain(FORMULA_WORKER);
    expect(SHIPPED).toContain(ROUTE_FILES[0]);
    expect(SHIPPED.length).toBeGreaterThan(500);
  });

  test("shipped code names Univer only through the presets", () => {
    const bad = SHIPPED.flatMap((file) =>
      info(file).imports.filter((ref) => isUniver(ref.spec) && !allowedUniverSpec(ref.spec, file)).map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
  });

  test("scripts name Univer only through the presets (listed exceptions aside)", () => {
    const bad = SCRIPTS.flatMap((file) =>
      info(file)
        .imports.filter((ref) => isUniver(ref.spec) && !allowedUniverSpec(ref.spec, file) && !(SCRIPT_EXCEPTIONS[file] ?? []).includes(ref.spec))
        .map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
  });

  test("only lib/sheets/univer/** and the editor host load Univer at runtime", () => {
    const bad = SHIPPED.filter((file) => !mayImportUniverAtRuntime(file)).flatMap((file) =>
      runtimeRefs(file).filter((ref) => isUniver(ref.spec)).map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
  });

  test("@univerjs/engine-formula is a direct dependency pinned at 1.0.2 while the worker imports it", () => {
    const usesEngine = runtimeRefs(FORMULA_WORKER).some((ref) => ref.spec === "@univerjs/engine-formula");
    if (usesEngine) expect(enginePinned).toBe(true);
  });

  test("the formula worker's module graph loads no preset main entry and no React", () => {
    const bad: string[] = [];
    for (const file of staticClosure(FORMULA_WORKER)) {
      for (const ref of runtimeRefs(file)) {
        const presetMain = /^@univerjs\/preset-sheets-[a-z-]+$/.test(ref.spec);
        if (presetMain || ref.spec === "react" || ref.spec === "react-dom") bad.push(`${file}: ${ref.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("ExcelJS (sheets.md §8, §11.1)", () => {
  test("runtime ExcelJS is the bare build, in the xlsx worker and its client only", () => {
    const bad = SHIPPED.flatMap((file) =>
      runtimeRefs(file)
        .filter((ref) => ref.spec === "exceljs" || ref.spec.startsWith("exceljs/"))
        .filter((ref) => ref.spec !== EXCEL_BARE || !XLSX_EXCEL_FILES.has(file))
        .map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
    for (const file of XLSX_EXCEL_FILES) expect(runtimeRefs(file).some((ref) => ref.spec === EXCEL_BARE)).toBe(true);
  });

  test("ExcelJS types are used under lib/sheets/xlsx only", () => {
    const bad = SHIPPED.filter((file) => !file.startsWith("lib/sheets/xlsx/")).flatMap((file) =>
      info(file).imports.filter((ref) => ref.spec === "exceljs" || ref.spec.startsWith("exceljs/")).map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
  });

  test("lib/sheets/xlsx/** touches no DOM global except client.ts", () => {
    const DOM = new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "DOMParser", "HTMLElement"]);
    const bad: string[] = [];
    for (const file of SHIPPED.filter((f) => f.startsWith("lib/sheets/xlsx/") && f !== "lib/sheets/xlsx/client.ts")) {
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && DOM.has(node.text)) {
          const parent = node.parent;
          const used =
            (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
            ts.isTypeOfExpression(parent) ||
            ((ts.isNewExpression(parent) || ts.isCallExpression(parent)) && parent.expression === node) ||
            (ts.isTypeReferenceNode(parent) && parent.typeName === node);
          if (used) bad.push(`${file}: ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(info(file).sf);
    }
    expect(bad).toEqual([]);
  });

  test("workers are started with the literal module-worker form bundlers understand", () => {
    const sites: string[] = [];
    for (const file of SHIPPED.filter((f) => f.startsWith("lib/sheets/"))) {
      const { sf } = info(file);
      const visit = (node: ts.Node): void => {
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Worker") {
          sites.push(`${file}: ${node.getText(sf).replace(/\s+/g, " ")}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(sites.length).toBeGreaterThanOrEqual(2);
    for (const site of sites) expect(site).toMatch(/new Worker\(new URL\("\.\/[\w.-]+\.ts", import\.meta\.url\), \{ type: "module" \}\)$/);
  });
});

describe("layers", () => {
  test("lib/sheets/sync/** loads no React, no Univer runtime and no Yjs", () => {
    const bad = SHIPPED.filter((f) => f.startsWith("lib/sheets/sync/")).flatMap((file) =>
      runtimeRefs(file)
        .filter((ref) => ref.spec === "react" || ref.spec === "react-dom" || isUniver(ref.spec) || ref.spec === "yjs" || ref.spec.startsWith("y-"))
        .map((ref) => `${file}: ${ref.spec}`),
    );
    expect(bad).toEqual([]);
  });

  test("components/sheets/** never reaches the connection or the generated bindings", () => {
    const BANNED = ["@/lib/spacetimedb/client", "@/lib/spacetimedb/generated", "@/lib/sheets/sync/connection"];
    const files = SHIPPED.filter((f) => f.startsWith("components/sheets/"));
    expect(files.length).toBeGreaterThan(10);
    const bad: string[] = [];
    for (const file of files) {
      for (const ref of info(file).imports) {
        if (BANNED.some((banned) => ref.spec === banned || ref.spec.startsWith(`${banned}/`))) bad.push(`${file}: ${ref.spec}`);
      }
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === "useLiveSpacetimeConnection") bad.push(`${file}: useLiveSpacetimeConnection`);
        ts.forEachChild(node, visit);
      };
      visit(info(file).sf);
    }
    expect(bad).toEqual([]);
  });
});

describe("the route stays light (sheets.md §13)", () => {
  test("the editor chunk is a client-only dynamic import", () => {
    const route = info(ROUTE_FILES[1]).text;
    expect(route).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("\.\/editor\/sheet-editor"\)\s*,\s*\{\s*ssr:\s*false/);
    expect(info(ROUTE_FILES[0]).text.startsWith('"use client"')).toBe(true);
  });

  for (const entry of ROUTE_FILES) {
    test(`${entry} reaches neither Univer nor ExcelJS through static imports`, () => {
      const closure = staticClosure(entry);
      expect(closure.size).toBeGreaterThan(5);
      const heavy = [...closure].filter(
        (file) =>
          file.startsWith("lib/sheets/univer/") ||
          file.startsWith("lib/sheets/xlsx/") ||
          file === HOST_FILE ||
          file === "components/sheets/editor/sheet-editor.tsx",
      );
      const packages = [...closure].flatMap((file) =>
        runtimeRefs(file).filter((ref) => isUniver(ref.spec) || ref.spec === "exceljs" || ref.spec.startsWith("exceljs/")).map((ref) => `${file}: ${ref.spec}`),
      );
      expect({ heavy, packages }).toEqual({ heavy: [], packages: [] });
    });
  }

  test("the closure walker follows @/ and relative imports (control)", () => {
    const closure = staticClosure(HOST_FILE);
    expect(closure.has("lib/sheets/univer/create-sheet-univer.ts")).toBe(true);
    expect(closure.has("lib/sheets/univer/presets.ts")).toBe(true);
  });
});
