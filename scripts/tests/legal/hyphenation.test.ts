import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../../next.config";
import * as emptyPatterns from "../../../lib/licenses/empty-hyphenation-patterns";
import {
  EMPTY_PATTERNS_MODULE, ENGINE_RENDER_BUILDS, ENGINE_RENDER_DIR, INLINED_PATTERN_LANGUAGES, installedPatternLoaders,
  patternExportName, patternLoaders, type PatternLoader,
} from "../../licenses/hyphenation";
import { BUNDLES } from "../../licenses/upstream";

/*
 * @univerjs/engine-render lazy-loads TeX hyphenation patterns, some under MPL/GPL/LGPL or LPPL only. next.config.ts
 * aliases every pattern file to an empty stand-in so none of that data ships (scripts/licenses/hyphenation.ts). Only
 * the American English patterns, inlined in engine-render's index.js, reach the bundle, and the notices list them.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const ES_DIR = join(ROOT, ENGINE_RENDER_DIR, "lib/es");
const loaders = installedPatternLoaders(ROOT);
const esFiles = (loaders.get("lib/es/index.js") ?? []).filter((l): l is PatternLoader & { target: string } => l.target !== null);

type Pattern = readonly [string, string, ...unknown[]];
const isPattern = (v: unknown): v is Pattern => Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string";

/** Each lazily loaded language's real pattern, read the way engine-render reads it: module[snackToPascal(lang)]. */
const patterns = new Map<string, Pattern>();
for (const loader of esFiles) {
  const mod = (await import(join(ES_DIR, loader.target.slice(2)))) as Record<string, unknown>;
  const pattern = mod[patternExportName(loader.lang)];
  if (isPattern(pattern)) patterns.set(loader.lang, pattern);
}

/** Quotes and backslashes removed: the minifier re-quotes and re-escapes string literals ('{"\'":…' vs "{\"'\":…"). */
const skeleton = (s: string) => s.replace(/[\\"'`]/g, "");
/** Enough of each language's trie to recognise it in a chunk. */
const signatures = new Map([...patterns].map(([lang, p]) => [lang, skeleton(p[1]).slice(0, 200)] as const));

/** The languages whose signature some chunk contains. */
function languagesInChunks(chunks: readonly string[]): string[] {
  const skeletons = chunks.map(skeleton);
  return [...signatures].filter(([, sig]) => skeletons.some((c) => c.includes(sig))).map(([lang]) => lang);
}

/** The American English trie, from the `const EnUs = [levels, trie, …]` literal inlined in engine-render's index.js. */
function inlinedEnUsTrie(): string {
  const src = readFileSync(join(ES_DIR, "index.js"), "utf8");
  const lines = src.slice(src.indexOf("const EnUs = [")).split("\n");
  return JSON.parse(lines[2].trim().replace(/,$/, "")) as string;
}

describe("engine-render's pattern table", () => {
  test("every build lazy-loads its patterns, and inlines only the languages the notices list", () => {
    expect([...loaders.keys()]).toEqual([...ENGINE_RENDER_BUILDS]);
    const esLangs = (loaders.get("lib/es/index.js") ?? []).map((l) => l.lang);
    for (const list of loaders.values()) {
      expect(list.filter((l) => l.target === null).map((l) => l.lang)).toEqual([...INLINED_PATTERN_LANGUAGES]);
      expect(list.map((l) => l.lang)).toEqual(esLangs);
    }
    expect(esFiles.length).toBeGreaterThan(50);
  });

  test("each real pattern file exports its data under the name engine-render looks up", () => {
    expect(esFiles.filter((l) => !patterns.has(l.lang)).map((l) => l.lang)).toEqual([]);
  });

  test("the parser reads both builds' loader forms and fails loudly on anything else (synthetic tables)", () => {
    const table = (body: string) => `x;\nconst PATTERN_LOADERS = {\n${body}\n};\ny;`;
    const both = [
      '\t["hu"]: () => import("./hu-A.js"),',
      '\t["ru"]: () => Promise.resolve().then(() => require("./ru-B.js")),',
      '\t["en-us"]: () => Promise.resolve().then(() => en_us_exports)',
    ].join("\n");
    expect(patternLoaders(table(both))).toEqual([
      { lang: "hu", target: "./hu-A.js" },
      { lang: "ru", target: "./ru-B.js" },
      { lang: "en-us", target: null },
    ]);
    expect(() => patternLoaders("const OTHER = {};")).toThrow("PATTERN_LOADERS not found");
    expect(() => patternLoaders(table('\t["hu"]: () => fetch("./hu-A.js")'))).toThrow('unexpected loader for "hu"');
    expect(() => patternLoaders(table("\t...spread"))).toThrow("unexpected PATTERN_LOADERS line");
    expect(() => patternLoaders(table(""))).toThrow("PATTERN_LOADERS is empty");
  });
});

describe("the pattern files never ship", () => {
  test("next.config.ts aliases every lazily loaded pattern file of every build to the empty stand-in", () => {
    const aliases = (nextConfig.turbopack?.resolveAlias ?? {}) as Record<string, unknown>;
    const unaliased = [...loaders.values()]
      .flat()
      .filter((l) => l.target !== null && aliases[l.target] !== EMPTY_PATTERNS_MODULE)
      .map((l) => `${l.lang} → ${l.target}`);
    expect(unaliased).toEqual([]);
    expect(existsSync(join(ROOT, EMPTY_PATTERNS_MODULE))).toBe(true);
  });

  test("the stand-in exports an empty pattern under exactly the names engine-render looks up", () => {
    const expected = esFiles.map((l) => patternExportName(l.lang)).sort();
    const exported = emptyPatterns as Record<string, unknown>;
    expect(Object.keys(exported).sort()).toEqual(expected);
    for (const name of expected) {
      const pattern = exported[name];
      expect(isPattern(pattern)).toBe(true);
      if (!isPattern(pattern)) continue;
      // engine-render's parsePattern: levels table split on ",", trie JSON-parsed; no third item = no exceptions.
      expect(pattern.length).toBe(2);
      expect(pattern[0].split(",")).toEqual([""]);
      expect(JSON.parse(pattern[1])).toEqual({});
    }
  });

  test("the American English patterns that do ship are in the notices", () => {
    const extras = BUNDLES.find((b) => b.host === "@univerjs/engine-render")?.extra?.map((e) => e.name) ?? [];
    for (const lang of INLINED_PATTERN_LANGUAGES) expect(extras).toContain(`hyph-${lang}`);
    expect(extras).toContain("hyphen");
  });
});

describe("built chunks carry no lazily loaded pattern data", () => {
  test("every language has a signature that the American English trie does not contain", () => {
    const enUs = skeleton(inlinedEnUsTrie());
    expect(signatures.size).toBe(esFiles.length);
    expect([...signatures].filter(([, sig]) => sig.length < 20 || enUs.includes(sig)).map(([lang]) => lang)).toEqual([]);
  });

  test("the scanner finds a pattern however the minifier quotes it (synthetic chunks)", () => {
    const hu = patterns.get("hu")?.[1] ?? "";
    const fr = patterns.get("fr")?.[1] ?? ""; // starts {"'":…, so a single-quoted literal escapes it
    expect(hu.length * fr.length).toBeGreaterThan(0);
    const doubleQuoted = `r.s(["Hu",0,["02,1",${JSON.stringify(hu)}]])`;
    const singleQuoted = `let e=["22,04",'${fr.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'];`;
    expect(languagesInChunks([doubleQuoted])).toEqual(["hu"]);
    expect(languagesInChunks(["x", singleQuoted])).toEqual(["fr"]);
    expect(languagesInChunks(['let e=["","{}"];t.s(["Hu",0,e,"Fr",0,e])', `let sA=[${JSON.stringify(inlinedEnUsTrie())}]`])).toEqual([]);
  });

  const inputs = ["next.config.ts", "scripts/licenses/hyphenation.ts", EMPTY_PATTERNS_MODULE, join(ENGINE_RENDER_DIR, "package.json")];
  const newestInput = Math.max(...inputs.map((p) => statSync(join(ROOT, p)).mtimeMs));
  for (const dir of [".next/static/chunks", "out/_next/static/chunks"]) {
    const abs = join(ROOT, dir);
    const files = existsSync(abs) ? readdirSync(abs).filter((f) => f.endsWith(".js")) : [];
    const builtAt = files.length > 0 ? Math.max(...files.map((f) => statSync(join(abs, f)).mtimeMs)) : 0;
    // A build older than the alias config proves nothing either way; rebuild to check it. Once one is newer, every
    // chunk in the folder counts: a leftover from an older build still ships with it.
    test.skipIf(builtAt < newestInput)(`${dir}: a build made after the alias config ships none of them`, () => {
      expect(languagesInChunks(files.map((f) => readFileSync(join(abs, f), "utf8")))).toEqual([]);
    });
  }
});
